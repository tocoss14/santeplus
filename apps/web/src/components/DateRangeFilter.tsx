interface DateRangeFilterProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  label?: string;
}

export default function DateRangeFilter({ from, to, onChange, label = 'Période' }: DateRangeFilterProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-medium text-slate-500 whitespace-nowrap">{label}</span>
      <input
        type="date"
        className="input py-1 text-xs w-[130px]"
        value={from}
        onChange={e => onChange(e.target.value, to)}
        title="Date de début"
      />
      <span className="text-xs text-slate-400">→</span>
      <input
        type="date"
        className="input py-1 text-xs w-[130px]"
        value={to}
        onChange={e => onChange(from, e.target.value)}
        title="Date de fin"
      />
      {(from || to) && (
        <button
          className="text-xs text-slate-400 hover:text-red-500 ml-0.5"
          onClick={() => onChange('', '')}
          title="Effacer les filtres"
        >
          ✕
        </button>
      )}
    </div>
  );
}
