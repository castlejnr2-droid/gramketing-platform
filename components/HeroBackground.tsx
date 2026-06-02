'use client';
import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  fadeSpeed: number;
}

export function HeroBackground() {
  const wrapRef  = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap   = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const COUNT     = 120;
    const LINK_DIST = 120;
    let particles: Particle[] = [];
    let W = 0;
    let H = 0;

    const setSize = (w: number, h: number) => {
      W = w;
      H = h;
      canvas.width  = w;
      canvas.height = h;
    };

    const spawn = (): Particle => ({
      x:         Math.random() * W,
      y:         H + Math.random() * 40,
      vx:        (Math.random() - 0.5) * 0.3,
      vy:        -(0.25 + Math.random() * 0.35),
      radius:    0.8 + Math.random() * 1.2,
      opacity:   0.3 + Math.random() * 0.3,
      fadeSpeed: 0.0008 + Math.random() * 0.0006,
    });

    const init = () => {
      particles = Array.from({ length: COUNT }, () => {
        const p = spawn();
        p.y = Math.random() * H; // scatter across full height on init
        return p;
      });
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // lines first
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx   = particles[i].x - particles[j].x;
          const dy   = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < LINK_DIST) {
            const alpha = (1 - dist / LINK_DIST) * 0.07;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(180,220,255,${alpha.toFixed(3)})`;
            ctx.lineWidth   = 0.6;
            ctx.stroke();
          }
        }
      }

      // dots
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,230,255,${p.opacity.toFixed(3)})`;
        ctx.fill();
      }
    };

    const update = () => {
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x       += p.vx;
        p.y       += p.vy;
        p.opacity -= p.fadeSpeed;
        if (p.y < -10 || p.opacity <= 0) {
          particles[i] = spawn();
        }
      }
    };

    const loop = () => {
      update();
      draw();
      animId = requestAnimationFrame(loop);
    };

    // Observe the wrapper div — its contentRect is reliable even when canvas is absolute
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width === 0 || height === 0) return;
      setSize(Math.round(width), Math.round(height));
      init();
    });
    ro.observe(wrap);

    // Kick off with current size in case ResizeObserver doesn't fire immediately
    const rect = wrap.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setSize(Math.round(rect.width), Math.round(rect.height));
      init();
      loop();
    } else {
      // Fallback: wait one frame for layout
      animId = requestAnimationFrame(() => {
        const r = wrap.getBoundingClientRect();
        setSize(Math.round(r.width) || window.innerWidth, Math.round(r.height) || 600);
        init();
        loop();
      });
    }

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      style={{
        position:      'absolute',
        top:           0,
        left:          0,
        width:         '100%',
        height:        '100%',
        overflow:      'hidden',
        pointerEvents: 'none',
        zIndex:        0,
        background:    'linear-gradient(160deg, #0a0f1c 0%, #0d1424 50%, #111827 100%)',
      }}
    >
      {/* Orbs at the true edges */}
      <div className="hero-orb hero-orb-cyan" />
      <div className="hero-orb hero-orb-blue" />
      <div className="hero-orb hero-orb-purple" />

      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top:      0,
          left:     0,
          width:    '100%',
          height:   '100%',
        }}
      />
    </div>
  );
}
