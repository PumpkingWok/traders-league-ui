import { type ReactNode } from 'react';

export function PixelBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[#e3e3e3]" />
    </div>
  );
}

export function PixelPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pixel-panel">
      <div className="pixel-panel__title">{title}</div>
      <div className="pixel-panel__body">{children}</div>
    </section>
  );
}

export function PixelStatCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="pixel-stat-card">
      <div className="pixel-stat-card__row">
        <div className="pixel-stat-card__left">
          <span className="pixel-stat-card__icon">{icon}</span>
          <span className="pixel-stat-card__label">{label}</span>
        </div>
        <span className="pixel-stat-card__value">{value}</span>
      </div>
    </div>
  );
}

export function PixelButton({
  children,
  variant = 'blue',
  className = '',
  onClick,
  title,
  disabled = false,
}: {
  children: ReactNode;
  variant?: 'blue' | 'gold' | 'green' | 'purple';
  className?: string;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      className={`pixel-button pixel-button--${variant} ${disabled ? 'pixel-button--disabled' : ''} ${className}`}
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function PixelSelectButton({
  children,
  active = false,
  onClick,
  className = '',
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pixel-select-button ${active ? 'pixel-select-button--active' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

export function PixelToggleChip({
  label,
  subtitle,
  dotClass,
  active = false,
  onClick,
}: {
  label: string;
  subtitle?: string;
  dotClass: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pixel-toggle-chip ${active ? 'pixel-toggle-chip--active' : ''}`}
    >
      <span className="pixel-toggle-chip__left">
        <span className={`h-3 w-3 border border-black ${dotClass}`} />
        <span>{label}</span>
      </span>
      {subtitle ? <span className="pixel-toggle-chip__subtitle">{subtitle}</span> : null}
    </button>
  );
}

export function PixelSlider({
  min,
  max,
  step,
  value,
  onChange,
  valueLabel,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  valueLabel: string;
}) {
  return (
    <div className="pixel-slider">
      <div className="pixel-slider__header">
        <span className="pixel-slider__limit">{min}</span>
        <span className="pixel-slider__value">{valueLabel}</span>
        <span className="pixel-slider__limit">{max}</span>
      </div>
      <input
        className="slider pixel-slider__input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

export function PixelDropdown({ label }: { label: string }) {
  return (
    <button type="button" className="pixel-dropdown">
      <span>{label}</span>
      <span>▾</span>
    </button>
  );
}

export function PixelTab({
  children,
  active = false,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pixel-tab ${active ? 'pixel-tab--active' : ''}`}
    >
      {children}
    </button>
  );
}

export function PixelInput({
  placeholder,
  value,
  onChange,
  type = 'text',
  min,
  step,
}: {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  type?: 'text' | 'number';
  min?: string;
  step?: string;
}) {
  return (
    <input
      className="pixel-input"
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      type={type}
      min={min}
      step={step}
    />
  );
}

export function PanelLabel({ children }: { children: ReactNode }) {
  return <div className="panel-label">{children}</div>;
}
