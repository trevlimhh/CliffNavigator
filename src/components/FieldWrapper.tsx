interface FieldWrapperProps {
  label: string;
  helpText?: string;
  missing?: boolean;
  children: React.ReactNode;
}

export function FieldWrapper({ label, helpText, missing, children }: FieldWrapperProps) {
  return (
    <label className={`block rounded-lg border p-3 ${missing ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
        {label}
        {missing && <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-800">please confirm</span>}
      </span>
      {helpText && <span className="mt-0.5 block text-xs text-slate-500">{helpText}</span>}
      <div className="mt-2">{children}</div>
    </label>
  );
}
