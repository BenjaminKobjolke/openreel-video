"""Render the compact, offline project overview used to locate clips for editing."""


SUMMARY_CLIP_LISTS = ("textClips", "shapeClips", "svgClips", "stickerClips")
TRANSFORM_DEFAULTS = {
    "position": {"x": 0, "y": 0},
    "scale": {"x": 1, "y": 1},
    "rotation": 0,
    "anchor": {"x": 0.5, "y": 0.5},
    "opacity": 1,
    "fitMode": "contain",
}


def format_transform(transform):
    if not isinstance(transform, dict):
        return ""
    fields = [
        f"{key}={value}"
        for key, value in transform.items()
        if key not in TRANSFORM_DEFAULTS or value != TRANSFORM_DEFAULTS[key]
    ]
    return " transform: " + ", ".join(fields) if fields else ""


def summarize(document):
    project = document.get("project", {})
    library = project.get("mediaLibrary", {})
    media = library.get("items", []) if isinstance(library, dict) else []
    media_names = {}
    print("Media:")
    for item in media:
        if not isinstance(item, dict):
            continue
        media_names[item.get("id")] = item.get("name", "<unnamed>")
        print(f"  {item.get('id')}  {item.get('type')}  {item.get('name', '')}")

    timeline = project.get("timeline", {})
    tracks = timeline.get("tracks", []) if isinstance(timeline, dict) else []
    print("Tracks:")
    for track in tracks:
        if not isinstance(track, dict):
            continue
        print(f"  {track.get('name', '')} ({track.get('type', '')})")
        for clip in track.get("clips", []):
            if not isinstance(clip, dict):
                continue
            label = media_names.get(clip.get("mediaId"), clip.get("mediaId", "<none>"))
            print(
                f"    {clip.get('id')} media={label} start={clip.get('startTime')}"
                f" duration={clip.get('duration')} inPoint={clip.get('inPoint')}"
                f" outPoint={clip.get('outPoint')}"
                f"{format_transform(clip.get('transform'))}"
            )
            grouped = {}
            for keyframe in clip.get("keyframes", []):
                if isinstance(keyframe, dict):
                    grouped.setdefault(keyframe.get("property", "unknown"), []).append(
                        f"{keyframe.get('time')}={keyframe.get('value')}"
                    )
            for prop, values in grouped.items():
                print(f"      {prop}: {', '.join(values)}")

    for field in SUMMARY_CLIP_LISTS:
        clips = project.get(field, [])
        if clips:
            details = ", ".join(
                f"{clip.get('id')}@{clip.get('startTime')}+{clip.get('duration')}"
                for clip in clips
                if isinstance(clip, dict)
            )
            print(f"{field}: {details}")
    if isinstance(timeline, dict):
        print(f"timeline.duration: {timeline.get('duration')}")
