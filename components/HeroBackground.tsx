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
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const COUNT = 60;
    const LINK_DIST = 120;
    let particles: Particle[] = [];

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    const spawn = (): Particle => ({
      x: Math.random() * (canvas.width ?? window.innerWidth),
      y: (canvas.height ?? window.innerHeight) + Math.random() * 40,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -(0.25 + Math.random() * 0.35),
      radius: 0.8 + Math.random() * 1.2,
      opacity: 0.3 + Math.random() * 0.3,
      fadeSpeed: 0.0008 + Math.random() * 0.0006,
    });

    const init = () => {
      particles = Array.from({ length: COUNT }, () => {
        const p = spawn();
        // scatter vertically so they don't all start at bottom
        p.y = Math.random() * (canvas.height ?? window.innerHeight);
        return p;
      });
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // draw linking lines first
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < LINK_DIST) {
            const alpha = (1 - dist / LINK_DIST) * 0.07;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(180,220,255,${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      // draw particles
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,230,255,${p.opacity})`;
        ctx.fill();
      }
    };

    const update = () => {
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
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

    const ro = new ResizeObserver(() => {
      resize();
      init();
    });
    ro.observe(canvas);
    resize();
    init();
    loop();

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
        background: 'linear-gradient(160deg, #0a0f1c 0%, #0d1424 50%, #111827 100%)',
      }}
    >
      {/* Orbs — pinned to corners, not center */}
      <div className="hero-orb hero-orb-cyan" />
      <div className="hero-orb hero-orb-blue" />
      <div className="hero-orb hero-orb-purple" />

      {/* Particle canvas */}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
    </div>
  );
}
