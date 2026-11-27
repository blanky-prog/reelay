'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { saveRecording } from '../../actions';

// Uploads the screen recording straight to storage from the browser (videos are too big
// for a server request), then sends the numbers and the file path to the server.
export function RecordingUpload({ clipId, clipperId, day }: { clipId: string; clipperId: string; day: 7 | 14 }) {
  const [path, setPath] = useState('');
  const [status, setStatus] = useState('');

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) return setStatus('That file is over 200 MB. Record a shorter clip.');
    setStatus('Uploading...');
    const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
    const p = `${clipperId}/${clipId}-day${day}-${Date.now()}.${ext}`;
    const { error } = await supabaseBrowser().storage.from('recordings').upload(p, file, { contentType: file.type || 'video/mp4' });
    if (error) return setStatus('Upload failed. Check your connection and try again.');
    setPath(p);
    setStatus('Uploaded. Now fill in the numbers below.');
  }

  return (
    <form action={saveRecording} className="card stack">
      <h2>Day {day} Insights recording</h2>
      <p className="muted">Open Instagram, go to this Reel, tap View insights and record your screen while you scroll through views, audience and watch time. Then enter the numbers you see.</p>
      <div>
        <label htmlFor={`rec${day}`}>Screen recording</label>
        <input id={`rec${day}`} type="file" accept="video/*" onChange={onFile} />
        {status && <p className="muted" role="status">{status}</p>}
      </div>
      <input type="hidden" name="clip_id" value={clipId} />
      <input type="hidden" name="day" value={day} />
      <input type="hidden" name="recording_path" value={path} />
      <div className="grid">
        {[['views', 'Views'], ['reach', 'Accounts reached'], ['likes', 'Likes'], ['comments', 'Comments'], ['shares', 'Shares'], ['saves', 'Saves'], ['avg_watch', 'Average watch time (seconds)'], ['india_pct', 'Audience in India (%)']].map(([k, label]) => (
          <div key={k}>
            <label htmlFor={`${k}${day}`}>{label}</label>
            <input id={`${k}${day}`} name={k} type="number" min={0} step={k === 'avg_watch' ? '0.1' : '1'} required />
          </div>
        ))}
      </div>
      <button className="primary" type="submit" disabled={!path}>Send day {day} recording</button>
    </form>
  );
}
