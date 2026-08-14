import os, base64, requests
from pathlib import Path

def headers():
    k=os.getenv("API_KEY","")
    return {"Authorization":"Bearer "+k} if k else {}

def transcribe(video_path):
    url=os.getenv("TRANSCRIBE_URL")
    if not url: raise RuntimeError("Chưa cấu hình TRANSCRIBE_URL")
    r=requests.post(url,json={"video_path":str(video_path)},headers=headers(),timeout=3600)
    r.raise_for_status()
    return r.json().get("segments",[])

def translate(text):
    url=os.getenv("TRANSLATE_URL")
    if not url: raise RuntimeError("Chưa cấu hình TRANSLATE_URL")
    r=requests.post(url,json={"text":text,"source":"zh","target":"vi"},headers=headers(),timeout=180)
    r.raise_for_status()
    return r.json().get("text","")

def tts(text, voice, out):
    url=os.getenv("TTS_URL")
    if not url: raise RuntimeError("Chưa cấu hình TTS_URL")
    r=requests.post(url,json={"text":text,"voice":voice},headers=headers(),timeout=300)
    r.raise_for_status()
    if "audio" in r.headers.get("content-type",""):
        out.write_bytes(r.content)
    else:
        out.write_bytes(base64.b64decode(r.json()["audio_base64"]))
