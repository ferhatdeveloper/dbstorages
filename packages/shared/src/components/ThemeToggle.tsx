import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useLocaleOptional } from '../context/LocaleContext';

type Props = {
  className?: string;
  /** Compact icon button for marketing nav */
  variant?: 'icon' | 'pill';
};

const ThemeToggle: React.FC<Props> = ({ className = '', variant = 'icon' }) => {
  const { resolved, toggle } = useTheme();
  const locale = useLocaleOptional();
  const isDark = resolved === 'dark';
  const label = locale
    ? locale.t(isDark ? 'common.themeToLight' : 'common.themeToDark')
    : isDark
      ? 'Açık temaya geç'
      : 'Koyu temaya geç';
  const short = locale
    ? locale.t(isDark ? 'common.light' : 'common.dark')
    : isDark
      ? 'Açık'
      : 'Koyu';

  if (variant === 'pill') {
    return (
      <button
        type="button"
        className={`theme-toggle theme-toggle-pill ${className}`.trim()}
        onClick={toggle}
        aria-label={label}
        title={label}
      >
        {isDark ? <Sun size={15} /> : <Moon size={15} />}
        <span>{short}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`theme-toggle theme-toggle-icon ${className}`.trim()}
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
};

export default ThemeToggle;
