"""Generate the narrator voiceover, one clip per scene, with word timings.

Each scene line is written as caption text. A token of the form
``[DISPLAY|spoken words]`` is shown as DISPLAY in the captions but read out
as "spoken words" by the voice, so "52 Nm" is not pronounced "nanometres".

Output (in build/vo/):
    sceneN.mp3   narrator audio for scene N
    sceneN.json  [{"text": caption token, "start": s, "end": s}, ...]

Usage: python3 voiceover.py [--voice en-IN-PrabhatNeural] [--rate +38%]
"""

import argparse
import asyncio
import json
import os
import re

import certifi

# edge-tts builds its TLS context from certifi's bundle at import time; honour
# a proxy CA bundle (e.g. behind a corporate proxy) when SSL_CERT_FILE is set.
if os.environ.get("SSL_CERT_FILE"):
    certifi.where = lambda: os.environ["SSL_CERT_FILE"]

import edge_tts  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "build", "vo")

SCENES = [
    "Both cost around [₹3.5 LAKHS,|three point five lakhs,] both have parallel-twin engines... "
    "but these two bikes couldn't be more different!",
    "On one side: Royal Enfield Continental [GT 650.|G T six fifty.] "
    "[650CC,|six fifty C C,] [52 NM|fifty-two newton metres] torque, "
    "and pure retro cafe racer soul.",
    "Twist the throttle, and that massive low-end grunt pulls you like a muscle car "
    "with a deep, addicting rumble!",
    "On the other side: Kawasaki Ninja 300. [300CC,|three hundred C C,] liquid-cooled, "
    "and high-revving Japanese precision!",
    "It weighs [35 KG|thirty-five kilos] less, screams up to [11,000 RPM,|eleven thousand R P M,] "
    "and handles twisties like a proper track weapon.",
    "If you want raw torque and road presence, go [GT!|G T!] "
    "If you want high-revving agility and sports fairing, go Ninja!",
    "Which twin engine sound is your favorite? Drop it in the comments "
    "and hit follow for more!",
]

TOKEN = re.compile(r"\[([^|\]]+)\|([^\]]+)\]|(\S+)")


def tokens(line):
    """Split a scene line into (display, spoken) pairs, one per caption token."""
    out = []
    for m in TOKEN.finditer(line):
        if m.group(3):
            out.append((m.group(3), m.group(3)))
        else:
            out.append((m.group(1), m.group(2)))
    return out


def alnum(s):
    return re.sub(r"[^0-9a-z]", "", s.lower())


def align(pairs, words):
    """Map TTS word boundaries back onto caption tokens.

    Boundaries are consumed in order until their letters cover the token's
    spoken letters, so a token read as several words spans all of them.
    """
    timed, i = [], 0
    for display, spoken in pairs:
        want = alnum(spoken)
        if not want:  # pure punctuation, e.g. "..."
            continue
        got, start, end = "", None, None
        while i < len(words) and len(got) < len(want):
            w = words[i]
            i += 1
            if not alnum(w["text"]):
                continue
            start = w["start"] if start is None else start
            end = w["end"]
            got += alnum(w["text"])
        if start is None:
            start = end = timed[-1]["end"] if timed else 0.0
        timed.append({"text": display, "start": round(start, 3), "end": round(end, 3)})
    return timed


async def synth(n, line, voice, rate, pitch):
    pairs = tokens(line)
    spoken = " ".join(s for _, s in pairs)
    conn = edge_tts.Communicate(spoken, voice, rate=rate, pitch=pitch, boundary="WordBoundary")
    audio, words = bytearray(), []
    async for chunk in conn.stream():
        if chunk["type"] == "audio":
            audio += chunk["data"]
        elif chunk["type"] == "WordBoundary":
            s = chunk["offset"] / 1e7
            words.append({"text": chunk["text"], "start": s, "end": s + chunk["duration"] / 1e7})
    with open(os.path.join(OUT, f"scene{n}.mp3"), "wb") as f:
        f.write(audio)
    with open(os.path.join(OUT, f"scene{n}.json"), "w") as f:
        json.dump(align(pairs, words), f, ensure_ascii=False, indent=1)
    print(f"scene{n}: {len(words)} words, ends {words[-1]['end']:.2f}s")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default="en-IN-PrabhatNeural")
    ap.add_argument("--rate", default="+38%")
    ap.add_argument("--pitch", default="+2Hz")
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    for n, line in enumerate(SCENES, 1):
        await synth(n, line, a.voice, a.rate, a.pitch)


if __name__ == "__main__":
    asyncio.run(main())
