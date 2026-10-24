import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { version } from '../package.json';
export default function About({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') { event.preventDefault(); dialog.current?.querySelector<HTMLButtonElement>('button')?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, [onClose]);
  return <div className="about-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><section className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title" ref={dialog}>
    <button className="about-close" onClick={onClose} aria-label="프로그램 정보 닫기"><X size={24}/></button>
    <img className="about-icon" src="./novel-icon-source.png" alt="Hinana Studio Novel 아이콘"/>
    <h2 id="about-title">HINANA STUDIO NOVEL</h2>
    <p>당신의 문장이 가장 편안하게 읽히는 곳, 나만의 독서 작업실</p>
    <dl><div><dt>프로그램 명</dt><dd>Hinana Studio Novel</dd></div><div><dt>개발/제작자</dt><dd>비나래</dd></div><div><dt>버전</dt><dd>Ver. {version}</dd></div></dl>
  </section></div>;
}
