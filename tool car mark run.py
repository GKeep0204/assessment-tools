import tkinter as tk
from tkinter import messagebox
import cv2
from PIL import Image, ImageTk

class VideoMarkerApp:
    def __init__(self, root, video_path):
        self.root = root
        self.root.title("交通录像标记小工具")
        self.root.geometry("900x750")
        
        self.video_path = video_path
        self.cap = cv2.VideoCapture(video_path)
        
        if not self.cap.isOpened():
            messagebox.showerror("错误", "无法打开视频，请确保视频名字叫 video.mp4 并且和代码在同一个文件夹")
            self.root.destroy()
            return

        self.fps = self.cap.get(cv2.CAP_PROP_FPS)
        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.duration = self.total_frames / self.fps if self.fps > 0 else 0
        
        self.current_frame = 0
        self.is_playing = False
        self.is_sliding = False 
        self.marks = []

        self.timer_id = None 

        self.setup_ui()
        self.show_frame(self.current_frame)

    def setup_ui(self):
        self.video_label = tk.Label(self.root, bg="black")
        self.video_label.pack(pady=10)

        control_frame = tk.Frame(self.root)
        control_frame.pack(fill=tk.X, padx=20, pady=5)

        self.btn_play = tk.Button(control_frame, text="▶ 播放", width=8, command=self.toggle_play, bg="#facc15", font=("微软雅黑", 10, "bold"))
        self.btn_play.pack(side=tk.LEFT, padx=5)

        self.time_label = tk.Label(control_frame, text="00:00 / 00:00", font=("Consolas", 12))
        self.time_label.pack(side=tk.LEFT, padx=15)

        self.scale = tk.Scale(control_frame, from_=0, to=self.duration, orient=tk.HORIZONTAL, 
                              resolution=0.1, showvalue=0, command=self.seek_video)
        self.scale.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=10)
        
        self.scale.bind("<ButtonPress-1>", self.on_slide_start)
        self.scale.bind("<ButtonRelease-1>", self.on_slide_end)

        add_frame = tk.Frame(self.root)
        add_frame.pack(fill=tk.X, padx=20, pady=10)

        tk.Label(add_frame, text="添加备注:", font=("微软雅黑", 11)).pack(side=tk.LEFT)
        self.entry_note = tk.Entry(add_frame, width=40, font=("微软雅黑", 11))
        self.entry_note.pack(side=tk.LEFT, padx=10, ipady=3)
        
        btn_add = tk.Button(add_frame, text="+ 标记当前画面", command=self.add_mark, bg="#93c5fd", font=("微软雅黑", 10, "bold"))
        btn_add.pack(side=tk.LEFT)

        list_frame = tk.Frame(self.root)
        list_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)

        tk.Label(list_frame, text="📍 标记列表（点击跳转）:", font=("微软雅黑", 11, "bold"), anchor="w").pack(fill=tk.X, pady=5)
        
        scrollbar = tk.Scrollbar(list_frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.listbox = tk.Listbox(list_frame, yscrollcommand=scrollbar.set, font=("微软雅黑", 12))
        self.listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.config(command=self.listbox.yview)
        
        self.listbox.bind('<<ListboxSelect>>', self.on_list_select)

    def on_slide_start(self, event):
        self.is_sliding = True

    def on_slide_end(self, event):
        self.is_sliding = False
        self.show_frame(self.current_frame)
        if self.is_playing:
            self.play_loop()

    def show_frame(self, frame_index):
        self.cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
        ret, frame = self.cap.read()
        if ret:
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            h, w, _ = frame.shape
            new_w = 800
            new_h = int(h * (new_w / w))
            frame = cv2.resize(frame, (new_w, new_h))
            
            img = Image.fromarray(frame)
            imgtk = ImageTk.PhotoImage(image=img)
            self.video_label.imgtk = imgtk
            self.video_label.configure(image=imgtk)

        cur_sec = self.current_frame / self.fps if self.fps else 0
        self.time_label.config(text=f"{self.format_time(cur_sec)} / {self.format_time(self.duration)}")
        
        if not self.is_sliding:
            self.scale.set(cur_sec)

    def play_loop(self):
        if self.is_playing and not self.is_sliding:
            if self.current_frame < self.total_frames - 1:
                self.current_frame += 1
                self.show_frame(self.current_frame)
                delay = int(1000 / self.fps) if self.fps > 0 else 30
                self.timer_id = self.root.after(delay, self.play_loop)
            else:
                self.current_frame = 0
                self.show_frame(self.current_frame)
                delay = int(1000 / self.fps) if self.fps > 0 else 30
                self.timer_id = self.root.after(delay, self.play_loop)

    def toggle_play(self):
        if not self.cap.isOpened(): return
        self.is_playing = not self.is_playing
        if self.is_playing:
            self.btn_play.config(text="⏸ 暂停")
            self.play_loop()
        else:
            self.btn_play.config(text="▶ 播放")
            if self.timer_id:
                self.root.after_cancel(self.timer_id)

    def seek_video(self, val):
        if not self.cap.isOpened(): return
        if self.is_sliding:
            target_sec = float(val)
            self.current_frame = int(target_sec * self.fps)
            self.show_frame(self.current_frame)

    def add_mark(self):
        text = self.entry_note.get().strip()
        if not text:
            messagebox.showwarning("提示", "备注内容不能为空！")
            return
        
        cur_sec = self.current_frame / self.fps if self.fps else 0
        mark_data = {
            "time": cur_sec,
            "frame": self.current_frame,
            "text": text
        }
        self.marks.append(mark_data)
        self.refresh_list()
        self.entry_note.delete(0, tk.END)

    def refresh_list(self):
        self.marks.sort(key=lambda x: x["time"])
        self.listbox.delete(0, tk.END)
        for mark in self.marks:
            time_str = self.format_time(mark["time"])
            display_text = f"⏱ {time_str}  |  {mark['text']}"
            self.listbox.insert(tk.END, display_text)

    def on_list_select(self, event):
        selection = self.listbox.curselection()
        if selection:
            index = selection[0]
            target_mark = self.marks[index]
            self.current_frame = target_mark["frame"]
            
            if self.is_playing and self.timer_id:
                self.root.after_cancel(self.timer_id)
            
            self.is_playing = False
            self.btn_play.config(text="▶ 播放")
            
            self.show_frame(self.current_frame)
            self.scale.set(self.current_frame / self.fps if self.fps else 0)

    def format_time(self, sec):
        m = int(sec // 60)
        s = int(sec % 60)
        return f"{m:02d}:{s:02d}"

    def on_closing(self):
        if self.timer_id:
            self.root.after_cancel(self.timer_id)
        if self.cap.isOpened():
            self.cap.release()
        self.root.destroy()

if __name__ == "__main__":
    root = tk.Tk()
    app = VideoMarkerApp(root, video_path="video.mp4") 
    root.protocol("WM_DELETE_WINDOW", app.on_closing)
    root.mainloop()