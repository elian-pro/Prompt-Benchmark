"use client";

import { InfoHint } from "@/components/ui/InfoHint";

type Props = {
  label: string;
  hint: string;
  /** Empty string means "unset" → the provider default is used. */
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  step: number;
  /** Slider position used while the field is still unset (Auto). */
  defaultValue: number;
};

/**
 * Labelled slider for ranged parameters (temperature, top_p). Preserves the
 * "unset → use provider default" state: until the user moves the slider the
 * value stays empty and the readout shows "Auto". The "Auto" reset clears it
 * back to the default.
 */
export function RangeField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  defaultValue,
}: Props) {
  const isSet = value.trim() !== "";
  const sliderValue = isSet ? Number(value) : defaultValue;

  return (
    <div className="range-field">
      <div className="range-field-head">
        <span className="param-label">
          {label}
          <InfoHint text={hint} />
        </span>
        <span className="range-field-value">
          {isSet ? (
            <>
              {sliderValue}
              <button
                type="button"
                className="range-reset"
                onClick={() => onChange("")}
                title="Usar el valor predeterminado del proveedor"
              >
                Auto
              </button>
            </>
          ) : (
            <span className="range-field-auto">Auto</span>
          )}
        </span>
      </div>
      <input
        type="range"
        className={`range-input${isSet ? "" : " unset"}`}
        min={min}
        max={max}
        step={step}
        value={sliderValue}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
