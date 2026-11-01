import type { CSSProperties, ReactNode } from 'react';
type HudFrameProps={children:ReactNode;title?:string;className?:string;style?:CSSProperties};
export function HudFrame({children,title,className='',style}:HudFrameProps){return <section className={`hud-frame ${className}`} style={style}>{title?<div className="hud-corner-title">{title}</div>:null}{children}</section>}
