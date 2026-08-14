import os,re,uuid,json,subprocess,threading,time,shutil
from pathlib import Path
from flask import Flask,request,jsonify,render_template,send_from_directory
from dotenv import load_dotenv
from services import transcribe,translate,tts

load_dotenv()
BASE=Path(__file__).resolve().parent
JOBS=BASE/"jobs"; OUT=BASE/"outputs"
JOBS.mkdir(exist_ok=True); OUT.mkdir(exist_ok=True)
app=Flask(__name__,static_folder="static",template_folder="templates")
app.config["MAX_CONTENT_LENGTH"]=int(os.getenv("MAX_UPLOAD_MB","2048"))*1024*1024
STATE={}

def safe(s): return re.sub(r"[^A-Za-z0-9._-]+","_",s or "")
def ff(args):
    p=subprocess.run(["ffmpeg","-y",*args],capture_output=True,text=True)
    if p.returncode: raise RuntimeError(p.stderr[-5000:])
def jobdir(j): return JOBS/j

def run_pipeline(j, filename, burn=True, original_volume=.18, tts_volume=1):
    d=jobdir(j); video=d/filename
    try:
        STATE[j].update(status="processing",progress=5,stage="Nhận diện tiếng Trung")
        segs=transcribe(video)
        if not segs: raise RuntimeError("AI không trả về segments")
        STATE[j]["segments"]=segs; STATE[j].update(progress=25,stage="Dịch tiếng Việt")
        for s in segs:
            s["vi"]=translate(s.get("text",""))
        STATE[j].update(progress=45,stage="Tạo thuyết minh")
        audios=[]
        for i,s in enumerate(segs):
            p=d/f"tts_{i:05d}.mp3"
            tts(s.get("vi",""),os.getenv("TTS_VOICE","vi-VN-HoaiMyNeural"),p)
            audios.append(p)
        STATE[j].update(progress=65,stage="Ghép voice-over")
        # Build filter: original audio at low volume + delayed TTS clips.
        args=["-i",str(video)]
        labels=[]
        for i,(s,p) in enumerate(zip(segs,audios)):
            args += ["-i",str(p)]
            delay=max(0,int(float(s.get("start",0))*1000))
            lab=f"t{i}"
            args_filter=f"[{i+1}:a]adelay={delay}|{delay},volume={tts_volume}[{lab}]"
            labels.append((lab,args_filter))
        filters=[x[1] for x in labels]
        mix_inputs="".join("["+x[0]+"]" for x in labels)
        filters.append(f"[0:a]volume={original_volume}[orig]")
        filters.append(f"{mix_inputs}[orig]amix=inputs={len(labels)+1}:duration=first:dropout_transition=0[mix]")
        mixed=d/"mixed.mp4"
        ff(args+["-filter_complex",";".join(filters),"-map","0:v:0","-map","[mix]","-c:v","copy","-c:a","aac","-shortest",str(mixed)])
        STATE[j].update(progress=80,stage="Đóng gói Vietsub")
        final=OUT/f"vietdub_{j}.mp4"
        if burn:
            srt=d/"sub.srt"
            write_srt(segs,srt)
            # Force a portable subtitle path; quote via ffmpeg filter escaping.
            subpath=str(srt).replace("\\","/").replace(":","\\:")
            ff(["-i",str(mixed),"-vf",f"subtitles='{subpath}'","-c:v","libx264","-preset","veryfast","-crf","22","-c:a","copy",str(final)])
        else:
            shutil.copy2(mixed,final)
        STATE[j].update(status="done",progress=100,stage="Hoàn tất",url=f"/media/outputs/{final.name}")
    except Exception as e:
        STATE[j].update(status="error",error=str(e),stage="Lỗi")

def fmt(t):
    t=float(t); h=int(t//3600); m=int((t%3600)//60); s=int(t%60); ms=int(round((t-int(t))*1000))
    if ms>=1000: s+=1;ms=0
    return f"{h:02}:{m:02}:{s:02},{ms:03}"
def write_srt(segs,path):
    with open(path,"w",encoding="utf-8") as f:
        for i,s in enumerate(segs,1):
            start=float(s.get("start",0)); end=float(s.get("end",start+3))
            text=s.get("vi","").strip()
            f.write(f"{i}\n{fmt(start)} --> {fmt(end)}\n{text}\n\n")

@app.get("/")
def index(): return render_template("index.html")

@app.post("/api/upload")
def upload():
    f=request.files.get("video")
    if not f or not f.filename:return jsonify(error="Chưa chọn video"),400
    ext=Path(f.filename).suffix.lower()
    if ext not in {".mp4",".mkv",".mov",".webm",".m4v"}:return jsonify(error="Định dạng không hỗ trợ"),400
    j=uuid.uuid4().hex; d=jobdir(j); d.mkdir()
    name="input"+ext; f.save(d/name)
    STATE[j]={"status":"uploaded","progress":0,"stage":"Sẵn sàng","segments":[]}
    return jsonify(job=j,filename=name)

@app.post("/api/start")
def start():
    d=request.get_json(silent=True) or {}; j=safe(d.get("job"))
    if j not in STATE:return jsonify(error="Job không tồn tại"),404
    threading.Thread(target=run_pipeline,args=(j,"input"+Path(STATE[j].get("filename",".mp4")).suffix,True,
        float(d.get("original_volume",.18)),float(d.get("tts_volume",1))),daemon=True).start()
    return jsonify(ok=True)

@app.get("/api/status/<j>")
def status(j):
    if j not in STATE:return jsonify(error="Không tồn tại"),404
    return jsonify(STATE[j])

@app.post("/api/save_segments/<j>")
def save_segments(j):
    if j not in STATE:return jsonify(error="Không tồn tại"),404
    segs=(request.get_json(silent=True) or {}).get("segments",[])
    STATE[j]["segments"]=segs
    return jsonify(ok=True)

@app.get("/media/<kind>/<name>")
def media(kind,name):
    folder=OUT if kind=="outputs" else None
    if not folder:return "Not found",404
    return send_from_directory(folder,safe(name),as_attachment=False)

@app.post("/api/import_srt/<j>")
def import_srt(j):
    f=request.files.get("srt")
    if j not in STATE or not f:return jsonify(error="Thiếu SRT"),400
    text=f.read().decode("utf-8-sig")
    segs=parse_srt(text);STATE[j]["segments"]=segs
    return jsonify(segments=segs)

def parse_srt(t):
    blocks=re.split(r"\n\s*\n",t.strip());out=[]
    for b in blocks:
        lines=b.splitlines()
        if len(lines)<3:continue
        tm=next((x for x in lines if "-->" in x),None)
        if not tm:continue
        a,z=[x.strip() for x in tm.split("-->")[:2]]
        def sec(x):
            x=x.replace(",","."); q=x.split(":")
            return float(q[0])*3600+float(q[1])*60+float(q[2])
        idx=lines.index(tm); txt=" ".join(lines[idx+1:]).strip()
        out.append({"start":sec(a),"end":sec(z),"text":txt,"vi":""})
    return out

@app.errorhandler(413)
def too_large(e):return jsonify(error="Video vượt giới hạn"),413

if __name__=="__main__":
    app.run("0.0.0.0",int(os.getenv("PORT","5000")),debug=False)
