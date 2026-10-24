"""Pull, summarize, and safely edit projects stored by the OpenReel sync server."""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from sync_project_summary import summarize


DEFAULT_SERVER_URL = "http://localhost:5180"
TOKEN_PATTERN = re.compile(r"^\s*set\s+OPENREEL_SYNC_TOKEN=(.*?)\s*$", re.I | re.M)
PROJECT_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def parse_token(batch_text):
    """Read a literal token assignment without returning unrelated batch values."""
    match = TOKEN_PATTERN.search(batch_text)
    if not match:
        return None
    value = match.group(1).strip().strip('"')
    return value or None


def get_token():
    token = os.environ.get("OPENREEL_SYNC_TOKEN")
    if token:
        return token
    batch_file = Path(__file__).resolve().parents[3] / "start-server.bat"
    try:
        token = parse_token(batch_file.read_text(encoding="utf-8"))
    except OSError:
        token = None
    if not token:
        raise ValueError(
            "OPENREEL_SYNC_TOKEN is not set and no literal token was found in start-server.bat"
        )
    return token


def download_needed(cached_version, server_version):
    return cached_version != server_version


def find_project(projects, query):
    query = str(query)
    exact = [project for project in projects if str(project.get("id", "")) == query]
    if len(exact) == 1:
        return exact[0]
    matches = [
        project
        for project in projects
        if query.casefold() in str(project.get("name", "")).casefold()
    ]
    if len(matches) == 1:
        return matches[0]
    if not matches:
        raise ValueError(f"No project matches '{query}'.")
    candidates = "; ".join(
        f"{project.get('id')} (version {project.get('version')}): {project.get('name')}"
        for project in matches
    )
    raise ValueError(f"More than one project matches '{query}': {candidates}")


def cache_root():
    configured = os.environ.get("OPENREEL_EDIT_CACHE")
    return (
        Path(configured).expanduser()
        if configured
        else Path.home() / ".openreel" / "claude-edit"
    )


def project_cache(root, project_id):
    if not PROJECT_ID_PATTERN.fullmatch(str(project_id)):
        raise ValueError(f"Invalid project id: {project_id}")
    return root / str(project_id)


def read_base(folder):
    try:
        with (folder / "base.json").open(encoding="utf-8") as source:
            base = json.load(source)
    except (OSError, json.JSONDecodeError):
        return None
    return base if isinstance(base, dict) else None


def request_json(path, method="GET", body=None):
    token = get_token()
    url = (os.environ.get("OPENREEL_SYNC_URL") or DEFAULT_SERVER_URL).rstrip("/") + path
    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {"Authorization": f"Bearer {token}"}
    if data is not None:
        headers["Content-Type"] = "application/json; charset=utf-8"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = response.read()
    except urllib.error.HTTPError as error:
        if error.code == 409:
            raise ValueError(
                "another device uploaded since the pull - run pull again and redo the edit"
            ) from None
        detail = error.read().decode("utf-8", errors="replace").replace(token, "[redacted]")
        raise ValueError(f"Sync server returned HTTP {error.code}: {detail}") from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise ValueError("Sync server is not reachable; start start-server.bat") from None
    try:
        return json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ValueError("Sync server returned invalid JSON") from None


def server_projects():
    projects = request_json("/api/projects")
    if not isinstance(projects, list):
        raise ValueError("Sync server returned an invalid project list")
    for project in projects:
        if not isinstance(project, dict) or not PROJECT_ID_PATTERN.fullmatch(
            str(project.get("id", ""))
        ):
            raise ValueError("Sync server returned an invalid project row")
    return projects


def read_cached_project(folder):
    base = read_base(folder)
    if base is None:
        raise ValueError("No cached project found; pull first")
    try:
        with (folder / "project.json").open(encoding="utf-8") as source:
            document = json.load(source)
    except (OSError, json.JSONDecodeError):
        raise ValueError("Cached project is missing or invalid; pull first") from None
    if not isinstance(document, dict):
        raise ValueError("Cached project is invalid; pull first")
    return base, document


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as destination:
        json.dump(value, destination, ensure_ascii=False, indent=2)
        destination.write("\n")


def list_projects():
    root = cache_root()
    for project in server_projects():
        folder = project_cache(root, project["id"])
        base = read_base(folder)
        cached = (
            "  cached"
            if base
            and base.get("version") == project.get("version")
            and (folder / "project.json").is_file()
            else ""
        )
        print(f"{project['id']}  {project.get('version')}  {project.get('name', '')}{cached}")


def pull_project(query):
    project = find_project(server_projects(), query)
    folder = project_cache(cache_root(), project["id"])
    base = read_base(folder)
    if (
        base
        and (folder / "project.json").is_file()
        and not download_needed(base.get("version"), project.get("version"))
    ):
        print(f"up to date (version {project['version']}), no download")
        print(folder.resolve())
        return
    project_id = urllib.parse.quote(str(project["id"]), safe="")
    details = request_json(f"/api/projects/{project_id}")
    if not isinstance(details, dict) or not isinstance(details.get("projectJson"), str):
        raise ValueError("Sync server returned an invalid project")
    try:
        document = json.loads(details["projectJson"])
    except json.JSONDecodeError:
        raise ValueError("Sync server returned invalid project JSON") from None
    if not isinstance(document, dict):
        raise ValueError("Sync server returned invalid project JSON")
    write_json(folder / "project.json", document)
    new_base = {
        "id": project["id"],
        "name": details.get("name", project.get("name", "")),
        "version": details.get("version", project.get("version")),
    }
    write_json(folder / "base.json", new_base)
    size = len(details["projectJson"].encode("utf-8"))
    print(f"downloaded version {new_base['version']} ({size} bytes)")
    print(folder.resolve())


def cached_folder(query):
    root = cache_root()
    if PROJECT_ID_PATTERN.fullmatch(str(query)):
        folder = project_cache(root, query)
        if read_base(folder):
            return folder
    matches = []
    if root.is_dir():
        for folder in root.iterdir():
            base = read_base(folder)
            if base and str(query).casefold() in str(base.get("name", "")).casefold():
                matches.append((folder, base))
    if len(matches) == 1:
        return matches[0][0]
    if not matches:
        raise ValueError(f"No cached project matches '{query}'; pull first")
    candidates = "; ".join(f"{base.get('id')}: {base.get('name')}" for _, base in matches)
    raise ValueError(f"More than one cached project matches '{query}': {candidates}")


def summary_project(query):
    _, document = read_cached_project(cached_folder(query))
    summarize(document)


def push_project(query):
    folder = cached_folder(query)
    base, document = read_cached_project(folder)
    project = document.get("project")
    if not isinstance(project, dict) or str(project.get("id")) != str(base.get("id")):
        raise ValueError("Cached project id does not match base.json")
    project["modifiedAt"] = time.time_ns() // 1_000_000
    project_json = json.dumps(document, ensure_ascii=False)
    project_name = project.get("name") or base.get("name", "")
    project_id = urllib.parse.quote(str(base["id"]), safe="")
    result = request_json(
        f"/api/projects/{project_id}",
        method="PUT",
        body={"name": project_name, "projectJson": project_json, "baseVersion": base["version"]},
    )
    if not isinstance(result, dict) or "version" not in result:
        raise ValueError("Sync server returned an invalid upload response")
    base.update({"name": project_name, "version": result["version"]})
    write_json(folder / "project.json", document)
    write_json(folder / "base.json", base)
    print(f"uploaded version {result['version']}")


def selftest():
    assert parse_token("rem set OPENREEL_SYNC_TOKEN=ignored\nset OPENREEL_SYNC_TOKEN=sample\n") == "sample"
    projects = [{"id": "one", "name": "Pasta Project"}, {"id": "two", "name": "Other"}]
    assert find_project(projects, "one")["id"] == "one"
    assert find_project(projects, "pasta")["id"] == "one"
    try:
        find_project(projects, "missing")
        raise AssertionError("missing project should fail")
    except ValueError:
        pass
    try:
        find_project(projects + [{"id": "three", "name": "Pasta backup"}], "pasta")
        raise AssertionError("ambiguous project should fail")
    except ValueError:
        pass
    assert download_needed(None, 1)
    assert not download_needed(2, 2)
    assert download_needed(1, 2)
    print("selftest passed")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("list")
    for command in ("pull", "summary", "push"):
        subparser = commands.add_parser(command)
        subparser.add_argument("name_or_id")
    commands.add_parser("selftest")
    args = parser.parse_args()
    try:
        if args.command == "list":
            list_projects()
        elif args.command == "pull":
            pull_project(args.name_or_id)
        elif args.command == "summary":
            summary_project(args.name_or_id)
        elif args.command == "push":
            push_project(args.name_or_id)
        else:
            selftest()
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
