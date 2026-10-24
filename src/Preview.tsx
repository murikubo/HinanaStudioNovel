import { useEffect, useRef, useState } from 'react';
const sizes: Record<string, [number, number]> = { mini: [744, 1133], tablet: [820, 1180], phone: [390, 844], desktop: [1280, 800] };
export const devices = { mini: '작은 태블릿', tablet: '큰 태블릿', phone: '스마트폰', desktop: '데스크톱' };
export default function Preview({ html, device, landscape, label }: { html: string; device: string; landscape: boolean; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 500, height: 650 });
  useEffect(() => { const observer = new ResizeObserver(entries => { const { width, height } = entries[0].contentRect; setArea({ width, height }); }); if (ref.current) observer.observe(ref.current); return () => observer.disconnect(); }, []);
  const base = sizes[device] || sizes.mini;
  const [width, height] = landscape ? [Math.max(...base), Math.min(...base)] : base;
  const scale = Math.max(0.01, Math.min((area.width - 48) / width, (area.height - 40) / height, 1));
  return <div className="preview-unit"><div className="device-caption"><span>{label || devices[device as keyof typeof devices]}</span><span>{width} × {height} <b>· {Math.max(1, Math.round(scale * 100))}%</b></span></div><div ref={ref} className="device-area"><div className="device-shell" style={{ width: width * scale + 16, height: height * scale + 16 }}><div className="device-viewport" style={{ width: width * scale, height: height * scale }}><iframe title={label || '독서 미리보기'} sandbox="allow-scripts" srcDoc={html} style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}/></div></div></div></div>;
}
