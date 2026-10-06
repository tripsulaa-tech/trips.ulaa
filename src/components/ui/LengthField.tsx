import { useState } from 'react';
import { FORM_INPUT_CLASS as inputClass } from '../../constants/formStyles';
import Select from './Select';
import {
  LENGTH_UNIT_OPTIONS, mmStringToText, toMmString, useLengthUnit, type LengthUnit,
} from '../../utils/lengthUnits';

interface LengthFieldProps {
  id: string;
  label: string;
  /** The value in millimetres (what the page stores and validates). */
  valueMm: string;
  onChangeMm: (mm: string) => void;
}

/** A size input the admin can type in mm, cm, in, ft or px. The unit is shared by
 *  every LengthField and remembered; the page only ever sees millimetres. */
export default function LengthField({ id, label, valueMm, onChangeMm }: LengthFieldProps) {
  const [unit, setUnit] = useLengthUnit();
  const [text, setText] = useState(() => mmStringToText(valueMm, unit));
  const [seen, setSeen] = useState<{ valueMm: string; unit: LengthUnit }>({ valueMm, unit });

  // Re-show the value when the unit or the stored value changes from outside
  // (typing keeps its own text, so it is never rewritten under the cursor).
  if (seen.valueMm !== valueMm || seen.unit !== unit) {
    setSeen({ valueMm, unit });
    const typedMm = toMmString(text, unit);
    const same = typedMm === valueMm || (typedMm !== '' && valueMm !== '' && Math.abs(Number(typedMm) - Number(valueMm)) < 1e-3);
    if (seen.unit !== unit || !same) setText(mmStringToText(valueMm, unit));
  }

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-dark mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          id={id}
          inputMode="decimal"
          value={text}
          onChange={e => {
            const next = e.target.value.replace(/[^\d.]/g, '');
            setText(next);
            onChangeMm(toMmString(next, unit));
          }}
          className={inputClass}
        />
        <div className="w-[5.5rem] shrink-0">
          <Select<LengthUnit> value={unit} onChange={setUnit} options={LENGTH_UNIT_OPTIONS} />
        </div>
      </div>
    </div>
  );
}
