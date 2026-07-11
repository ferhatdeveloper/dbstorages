import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

type Props = {
  className?: string;
  /** Compact icon button for marketing nav */
  variant?: 'icon' | 'pill';
};

const ThemeToggle: React.FC<Props> = ({ className = '', variant = 'icon' }) => {
  const { resolved, toggle } = useTheme();
  const isDark = resolved === 'dark';
  const label = isDark ? 'Açık temaya geç' : 'Koyu temaya geç';

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
        <span>{isDark ? 'Açık' : 'Koyu'}</span>
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
