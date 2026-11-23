import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { parseIntervals, legacyIntervals } from '../lib/playback';
export default function Player() {
  const [params] = useSearchParams();
  const [id, setId] = useState(params.get('v') || params.get('youtube_video_id') || '');
  const [skip, setSkip] = useState(params.get('skip') || legacyIntervals(params, 'skip'));
  const [mute, setMute] = useState(params.get('mute') || legacyIntervals(params, 'mute'));
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const target = useRef<HTMLDivElement>(null);
  const player = useRef<any>(null);
  const rules = useRef({ skip: [] as number[][], mute: [] as number[][] });
  useEffect(() => () => player.current?.destroy(), []);
  async function start() {
    try {
      let video = id;
      if (id.startsWith('http')) {
        const u = new URL(id);
        if (!['youtube.com', 'www.youtube.com', 'youtu.be'].includes(u.hostname))
          throw new Error('Use a YouTube URL or video ID.');
        video = u.hostname === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') || '';
      }
      if (!/^[A-Za-z0-9_-]{11}$/.test(video))
        throw new Error('Please enter a valid YouTube video ID.');
      rules.current = {
        skip: parseIntervals(skip),
        mute: parseIntervals(mute),
      };
      setError('');
      const w = window as any;
      if (!w.YT?.Player)
        await new Promise<void>((resolve, reject) => {
          w.onYouTubeIframeAPIReady = resolve;
          const script = document.createElement('script');
          script.src = 'https://www.youtube.com/iframe_api';
          script.onerror = () => reject(new Error('YouTube could not load. Please retry.'));
          document.head.appendChild(script);
        });
      player.current?.destroy();
      const element = document.createElement('div');
      target.current!.replaceChildren(element);
      player.current = new w.YT.Player(element, {
        host: 'https://www.youtube-nocookie.com',
        videoId: video,
        playerVars: { origin: location.origin },
        events: { onReady: () => setReady(true) },
      });
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    if (!ready) return;
    const timer = setInterval(() => {
      const p = player.current;
      if (!p?.getCurrentTime) return;
      const time = p.getCurrentTime();
      const skipTo = rules.current.skip.find(([a, b]) => time >= a && time < b);
      if (skipTo) p.seekTo(skipTo[1], true);
      const muted = rules.current.mute.some(([a, b]) => time >= a && time < b);
      if (muted) p.mute();
      else if (p.isMuted()) p.unMute();
    }, 200);
    return () => clearInterval(timer);
  }, [ready]);
  return (
    <>
      <h1>YouTube skip / mute player</h1>
      <p>
        Play a YouTube video with optional skip and mute intervals. The video loads from YouTube
        only when you press Load video.
      </p>
      <form
        className="stacked-form"
        onSubmit={(e) => {
          e.preventDefault();
          void start();
        }}
      >
        <label>
          YouTube URL or video ID
          <input value={id} onChange={(e) => setId(e.target.value)} required />
        </label>
        <label>
          Skip intervals (seconds)
          <input
            value={skip}
            onChange={(e) => setSkip(e.target.value)}
            placeholder="12-18, 30-42"
          />
        </label>
        <label>
          Mute intervals (seconds)
          <input value={mute} onChange={(e) => setMute(e.target.value)} placeholder="5-9" />
        </label>
        <button>Load video</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <div ref={target} className="video-player" />
    </>
  );
}
