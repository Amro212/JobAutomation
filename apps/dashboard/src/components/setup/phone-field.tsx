'use client';

import * as React from 'react';
import {
  AsYouType,
  type CountryCode,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString
} from 'libphonenumber-js';
import { Check, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const PRIORITY: CountryCode[] = [
  'US',
  'CA',
  'GB',
  'AU',
  'DE',
  'FR',
  'ES',
  'IT',
  'NL',
  'IN',
  'JP',
  'KR',
  'CN',
  'BR',
  'MX',
  'IE',
  'NZ',
  'SG',
  'CH',
  'AT',
  'BE',
  'SE',
  'NO',
  'DK',
  'FI',
  'PL',
  'PT',
  'IL',
  'ZA',
  'AE'
];

function countryToFlag(code: CountryCode): string {
  if (code.length !== 2) return '🌐';
  return code
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

let cachedOptions: { code: CountryCode; name: string; dial: string }[] | null = null;

function getCountryOptions(): { code: CountryCode; name: string; dial: string }[] {
  if (cachedOptions) return cachedOptions;
  const dn = new Intl.DisplayNames(['en'], { type: 'region' });
  const items = getCountries().map((code) => ({
    code,
    name: dn.of(code) ?? code,
    dial: `+${getCountryCallingCode(code)}`
  }));
  items.sort((a, b) => {
    const ai = PRIORITY.indexOf(a.code);
    const bi = PRIORITY.indexOf(b.code);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
  cachedOptions = items;
  return items;
}

/** Longest calling-code prefixes first so +1 does not steal +12… */
function dialPrefixesByLength(): { code: CountryCode; dial: string }[] {
  return getCountries()
    .map((code) => ({ code, dial: getCountryCallingCode(code) }))
    .sort((a, b) => b.dial.length - a.dial.length);
}

const DIAL_PREFIXES = dialPrefixesByLength();

function splitInternational(stored: string): { country: CountryCode; nationalDigits: string } | null {
  if (!stored.startsWith('+')) return null;
  const rest = stored.slice(1);
  for (const { code, dial } of DIAL_PREFIXES) {
    if (rest.startsWith(dial)) {
      return { country: code, nationalDigits: rest.slice(dial.length) };
    }
  }
  return null;
}

function parseStoredValue(stored: string): { country: CountryCode; nationalDigits: string } {
  const trimmed = stored.trim();
  if (!trimmed) {
    return { country: 'US', nationalDigits: '' };
  }

  const parsed = parsePhoneNumberFromString(trimmed);
  if (parsed?.country) {
    return { country: parsed.country, nationalDigits: parsed.nationalNumber };
  }

  const split = splitInternational(trimmed);
  if (split) {
    return split;
  }

  const onlyDigits = trimmed.replace(/\D/g, '');
  if (onlyDigits.length === 11 && onlyDigits.startsWith('1')) {
    const national = onlyDigits.slice(1);
    const nanp = parsePhoneNumberFromString(national, 'US');
    if (nanp?.isValid()) {
      return {
        country: (nanp.country ?? 'US') as CountryCode,
        nationalDigits: nanp.nationalNumber
      };
    }
  }
  if (onlyDigits.length === 10) {
    const nanp = parsePhoneNumberFromString(onlyDigits, 'US');
    if (nanp?.isValid()) {
      return {
        country: (nanp.country ?? 'US') as CountryCode,
        nationalDigits: nanp.nationalNumber
      };
    }
  }

  return { country: 'US', nationalDigits: onlyDigits.slice(0, 15) };
}

function formatNational(digits: string, country: CountryCode): string {
  if (!digits) return '';
  const ayt = new AsYouType(country);
  let out = '';
  for (const ch of digits) {
    if (ch >= '0' && ch <= '9') {
      out = ayt.input(ch);
    }
  }
  return out;
}

/** Index in `nationalDigits` of the last digit whose formatted position is strictly before `pos`. */
function lastNationalDigitIndexBefore(display: string, pos: number): number {
  let idx = -1;
  let d = -1;
  for (let i = 0; i < pos && i < display.length; i++) {
    const c = display[i]!;
    if (c >= '0' && c <= '9') {
      d++;
      idx = d;
    }
  }
  return idx;
}

/** Index in `nationalDigits` of the first digit at a formatted index >= `fromPos`. */
function firstNationalDigitIndexFrom(display: string, fromPos: number): number {
  let d = -1;
  for (let i = 0; i < display.length; i++) {
    const c = display[i]!;
    if (c >= '0' && c <= '9') {
      d++;
      if (i >= fromPos) return d;
    }
  }
  return -1;
}

function toFormValue(country: CountryCode, nationalDigits: string): string {
  if (!nationalDigits) return '';
  const parsed = parsePhoneNumberFromString(nationalDigits, country);
  if (parsed?.isValid()) {
    return parsed.format('E.164');
  }
  return `+${getCountryCallingCode(country)}${nationalDigits}`;
}

export function PhoneField({
  name,
  defaultValue,
  id,
  'aria-describedby': ariaDescribedBy
}: {
  name: string;
  defaultValue: string;
  id?: string;
  'aria-describedby'?: string;
}) {
  const [country, setCountry] = React.useState<CountryCode>(
    () => parseStoredValue(defaultValue).country
  );
  const [nationalDigits, setNationalDigits] = React.useState(
    () => parseStoredValue(defaultValue).nationalDigits
  );
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  React.useEffect(() => {
    const next = parseStoredValue(defaultValue);
    setCountry(next.country);
    setNationalDigits(next.nationalDigits);
  }, [defaultValue]);

  const options = React.useMemo(() => getCountryOptions(), []);
  const selected = options.find((o) => o.code === country) ?? options[0];
  const display = formatNational(nationalDigits, country);
  const formValue = toFormValue(country, nationalDigits);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.code.toLowerCase().includes(q) ||
        o.dial.includes(q)
    );
  }, [options, query]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 15);
    setNationalDigits(digits);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
    const el = e.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return;

    const s = el.selectionStart ?? 0;

    if (e.key === 'Backspace') {
      if (s === 0) return;
      const removePos = s - 1;
      const ch = display[removePos];
      if (ch !== undefined && ch >= '0' && ch <= '9') return;
      e.preventDefault();
      setNationalDigits((prev) => {
        const disp = formatNational(prev, country);
        const idx = lastNationalDigitIndexBefore(disp, s);
        if (idx >= 0) return prev.slice(0, idx) + prev.slice(idx + 1);
        if (prev.length > 0) return prev.slice(1);
        return prev;
      });
      return;
    }

    if (s >= display.length) return;
    const forward = display[s];
    if (forward !== undefined && forward >= '0' && forward <= '9') return;
    e.preventDefault();
    setNationalDigits((prev) => {
      const disp = formatNational(prev, country);
      let idx = firstNationalDigitIndexFrom(disp, s);
      if (idx < 0) idx = lastNationalDigitIndexBefore(disp, s + 1);
      if (idx >= 0) return prev.slice(0, idx) + prev.slice(idx + 1);
      return prev;
    });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text/plain').trim();
    const pasted =
      parsePhoneNumberFromString(text) ?? parsePhoneNumberFromString(text, country);
    if (pasted?.country && pasted.nationalNumber) {
      e.preventDefault();
      setCountry(pasted.country);
      setNationalDigits(pasted.nationalNumber);
      return;
    }
    const split = splitInternational(text);
    if (split && split.nationalDigits) {
      e.preventDefault();
      setCountry(split.country);
      setNationalDigits(split.nationalDigits.replace(/\D/g, '').slice(0, 15));
    }
  };

  return (
    <div>
      <input type="hidden" name={name} value={formValue} />
      <div
        className={cn(
          'flex h-9 w-full overflow-hidden rounded-md border border-input bg-background shadow-sm transition-colors',
          'focus-within:border-ring focus-within:ring-1 focus-within:ring-ring'
        )}
      >
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              aria-label="Country calling code"
              className="h-full shrink-0 rounded-none border-r border-input bg-muted/40 px-2.5 hover:bg-muted/60 focus-visible:z-10 focus-visible:ring-0"
            >
              <span className="text-base leading-none" aria-hidden>
                {countryToFlag(country)}
              </span>
              <span className="ml-1.5 hidden text-sm font-medium tabular-nums sm:inline">
                {selected.dial}
              </span>
              <ChevronsUpDown className="ml-1 size-3.5 shrink-0 opacity-50" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(100vw-2rem,320px)] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search country or code…"
                value={query}
                onValueChange={setQuery}
              />
              <CommandList className="max-h-[min(50vh,280px)]">
                <CommandEmpty>No country found.</CommandEmpty>
                <CommandGroup>
                  {filtered.map((o) => (
                    <CommandItem
                      key={o.code}
                      value={`${o.code}-${o.dial}-${o.name}`}
                      onSelect={() => {
                        setCountry(o.code);
                        setOpen(false);
                        setQuery('');
                      }}
                    >
                      <span className="mr-2 text-base" aria-hidden>
                        {countryToFlag(o.code)}
                      </span>
                      <span className="flex-1 truncate">{o.name}</span>
                      <span className="ml-2 tabular-nums text-muted-foreground">{o.dial}</span>
                      <Check
                        className={cn(
                          'ml-2 size-4 shrink-0',
                          o.code === country ? 'opacity-100' : 'opacity-0'
                        )}
                        aria-hidden
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          aria-describedby={ariaDescribedBy}
          className={cn(
            'min-w-0 flex-1 border-0 bg-transparent px-3 py-1 text-base shadow-none outline-none',
            'placeholder:text-muted-foreground focus-visible:ring-0 md:text-sm'
          )}
          placeholder={country === 'US' || country === 'CA' ? '(555) 123-4567' : 'Phone number'}
          value={display}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />
      </div>
    </div>
  );
}
