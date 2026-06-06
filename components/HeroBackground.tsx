'use client';
import { useEffect, useRef } from 'react';

interface Orb {
  x: number; y: number; r: number;
  color: string; op: number;
  sx: number; sy: number; phase: number;
}

const ORBS: Orb[] = [
  { x:0.08, y:0.15, r:0.38, color:'#00f5ff', op:0.50, sx:0.00018, sy:0.00012, phase:0   },
  { x:0.88, y:0.72, r:0.42, color:'#00b8ff', op:0.45, sx:0.00014, sy:0.00016, phase:1.2 },
  { x:0.78, y:0.12, r:0.30, color:'#8b5cf6', op:0.48, sx:0.00020, sy:0.00010, phase:2.4 },
  { x:0.15, y:0.80, r:0.34, color:'#0055ff', op:0.42, sx:0.00016, sy:0.00018, phase:0.7 },
  { x:0.50, y:0.95, r:0.25, color:'#00f5ff', op:0.38, sx:0.00022, sy:0.00014, phase:3.5 },
  { x:0.92, y:0.40, r:0.22, color:'#8b5cf6', op:0.40, sx:0.00012, sy:0.00020, phase:1.8 },
];

const PARTICLE_COUNT = 120;
const LINK_DIST      = 110;

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `${r},${g},${b}`;
}

export function HeroBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let t = 0;

    // Mouse parallax - track on window
    const mouse  = { x: 0, y: 0 };
    const mTarget = { x: 0, y: 0 };
    const onMouseMove = (e: MouseEvent) => {
      mTarget.x = e.clientX / window.innerWidth  - 0.5;
      mTarget.y = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener('mousemove', onMouseMove);

    // Particles
    interface Particle { x:number; y:number; vx:number; vy:number; opacity:number }
    let W = 0, H = 0;
    let particles: Particle[] = [];

    const spawnParticle = (): Particle => ({
      x:       Math.random() * W,
      y:       Math.random() * H,
      vx:      (Math.random() - 0.5) * 0.25,
      vy:      -(0.18 + Math.random() * 0.28),
      opacity: 0.2 + Math.random() * 0.5,
    });

    const setSize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width  = W;
      canvas.height = H;
    };

    const init = () => {
      particles = Array.from({ length: PARTICLE_COUNT }, spawnParticle);
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // Slow global drift angle - full rotation every ~420s
      const drift = t * 0.0015;

      for (const o of ORBS) {
        // Per-orb oscillation + slow global drift applied to base position
        const ox = o.x + Math.sin(t * o.sx * 60 + o.phase + drift) * 0.06
                       + Math.cos(drift * 0.7 + o.phase) * 0.03
                       + mouse.x * 0.025;
        const oy = o.y + Math.cos(t * o.sy * 60 + o.phase + drift) * 0.06
                       + Math.sin(drift * 0.7 + o.phase) * 0.03
                       + mouse.y * 0.025;
        const px  = ox * W;
        const py  = oy * H;
        const rad = o.r * Math.min(W, H) * (1 + Math.sin(t * 0.008 + o.phase) * 0.08);

        const grad = ctx.createRadialGradient(px, py, 0, px, py, rad);
        grad.addColorStop(0,   `rgba(${hexToRgb(o.color)},${o.op})`);
        grad.addColorStop(0.45,`rgba(${hexToRgb(o.color)},${(o.op * 0.4).toFixed(3)})`);
        grad.addColorStop(1,   `rgba(${hexToRgb(o.color)},0)`);

        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Connection lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx   = particles[i].x - particles[j].x;
          const dy   = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < LINK_DIST) {
            const alpha = (1 - dist / LINK_DIST) * 0.12;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0,220,255,${alpha.toFixed(3)})`;
            ctx.lineWidth   = 0.5;
            ctx.stroke();
          }
        }
      }

      // Dots
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,220,255,${p.opacity.toFixed(3)})`;
        ctx.fill();
      }
    };

    const update = () => {
      t++;
      mouse.x += (mTarget.x - mouse.x) * 0.04;
      mouse.y += (mTarget.y - mouse.y) * 0.04;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -5)    p.x = W + 5;
        if (p.x > W + 5) p.x = -5;
        if (p.y < -5) {
          p.y       = H + 5;
          p.x       = Math.random() * W;
          p.opacity = 0.2 + Math.random() * 0.5;
        }
      }
    };

    const loop = () => { update(); draw(); animId = requestAnimationFrame(loop); };

    const onResize = () => { setSize(); init(); };
    window.addEventListener('resize', onResize);

    setSize();
    init();
    loop();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position:      'fixed',
        inset:         0,
        pointerEvents: 'none',
        zIndex:        0,
        background:    'linear-gradient(160deg, #0a0f1c 0%, #0b1424 50%, #111827 100%)',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      />
    </div>
  );
}
