export type ThemeId =
  | 'obsidian'
  | 'pure-black'
  | 'botvex-cosmic'
  | 'light'
  | 'stripe-midnight'
  | 'github-dimmed'
  | 'nord-frost'
  | 'openai-emerald'
  | 'linear-violet';

export type ThemePreset = {
  id: ThemeId;
  name: string;
  subtitle: string;
  group: 'base' | 'enterprise';
  previewBg: string;
  previewAccent: string;
};

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'obsidian',
    name: 'Мягкий графит',
    subtitle: 'Комфортный тёмно-серый · Discord style',
    group: 'base',
    previewBg: '#313338',
    previewAccent: '#5865f2',
  },
  {
    id: 'pure-black',
    name: 'Концентрированный чёрный',
    subtitle: 'Комфортный AMOLED #000000 · X / Vercel',
    group: 'base',
    previewBg: '#000000',
    previewAccent: '#6366f1',
  },
  {
    id: 'light',
    name: 'Светлая',
    subtitle: 'Дневной контраст · Apple / Notion',
    group: 'base',
    previewBg: '#f4f5f7',
    previewAccent: '#4f46e5',
  },
  {
    id: 'botvex-cosmic',
    name: 'BOTVEX Cosmic',
    subtitle: 'Фирменный стиль бота · Мрамор + Сапфир',
    group: 'enterprise',
    previewBg: '#060b16',
    previewAccent: '#4f8cff',
  },
  {
    id: 'stripe-midnight',
    name: 'Stripe Midnight',
    subtitle: 'Глубокий сапфир + Electric Indigo',
    group: 'enterprise',
    previewBg: '#0a2540',
    previewAccent: '#635bff',
  },
  {
    id: 'github-dimmed',
    name: 'GitHub Dimmed',
    subtitle: 'Спокойный сланец без усталости глаз',
    group: 'enterprise',
    previewBg: '#22272e',
    previewAccent: '#539bf5',
  },
  {
    id: 'nord-frost',
    name: 'Nord Arctic',
    subtitle: 'Арктический синий + ледяной циан',
    group: 'enterprise',
    previewBg: '#2e3440',
    previewAccent: '#88c0d0',
  },
  {
    id: 'openai-emerald',
    name: 'OpenAI Emerald',
    subtitle: 'Угольный минимализм + изумруд',
    group: 'enterprise',
    previewBg: '#0d1110',
    previewAccent: '#10a37f',
  },
  {
    id: 'linear-violet',
    name: 'Linear Nebula',
    subtitle: 'Тёмный аметист + неоновый фиолет',
    group: 'enterprise',
    previewBg: '#0b0a12',
    previewAccent: '#8b5cf6',
  },
];

const THEME_KEY = 'botvex_theme_id';
const ACCENT_KEY = 'botvex_custom_accent';

export function getSavedTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_KEY) as ThemeId | null;
    if (raw && THEME_PRESETS.some((p) => p.id === raw)) return raw;
  } catch {
    // ignore
  }
  return 'pure-black';
}

export function getSavedCustomAccent(): string {
  try {
    const raw = localStorage.getItem(ACCENT_KEY);
    if (raw && /^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
  } catch {
    // ignore
  }
  return '';
}

export function applyTheme(themeId: ThemeId, customAccent?: string): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', themeId);
  try {
    localStorage.setItem(THEME_KEY, themeId);
  } catch {
    // ignore
  }

  const accent = customAccent !== undefined ? customAccent : getSavedCustomAccent();
  if (accent && /^#[0-9a-fA-F]{6}$/.test(accent)) {
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-hover', accent);
    root.style.setProperty('--accent-soft', `color-mix(in srgb, ${accent} 16%, transparent)`);
    try {
      localStorage.setItem(ACCENT_KEY, accent);
    } catch {
      // ignore
    }
  } else {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-hover');
    root.style.removeProperty('--accent-soft');
    if (customAccent === '') {
      try {
        localStorage.removeItem(ACCENT_KEY);
      } catch {
        // ignore
      }
    }
  }
}
