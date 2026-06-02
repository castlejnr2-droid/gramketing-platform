import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#050810',
          light: '#0A0F1E',
          deep: '#030508',
        },
        blue: {
          electric: '#0088CC',
          light: '#00AAFF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 20px #0088CC33' },
          '100%': { boxShadow: '0 0 40px #0088CC66' },
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
