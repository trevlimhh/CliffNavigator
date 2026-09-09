import { FieldWrapper } from "./FieldWrapper";

interface YesNoFieldProps {
  label: string;
  helpText?: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  missing?: boolean;
}

/**
 * A plain checkbox can't distinguish "answered No" from "not answered yet" — both render
 * unchecked, so a required boolean field silently blocks form submission with no visible cause.
 * This shows Yes/No as two buttons where NEITHER is highlighted until the user picks one.
 */
export function YesNoField({ label, helpText, value, onChange, missing }: YesNoFieldProps) {
  return (
    <FieldWrapper label={label} helpText={helpText} missing={missing}>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`flex-1 rounded border px-3 py-1.5 text-sm font-medium ${
            value === true ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`flex-1 rounded border px-3 py-1.5 text-sm font-medium ${
            value === false ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          No
        </button>
      </div>
    </FieldWrapper>
  );
}
