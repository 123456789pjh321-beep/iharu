import {useId, useState} from 'react';
import {
  calculateAverageStockPrice, calculateLoanRepayment, calculateNetInterest,
  calculateRentalYield, calculateStockReturn, calculateVat, type LoanRepaymentMethod,
} from '../../../shared/ledger-economy';

const categories = {
  property: [{id: 'loan', label: '대출 상환'}, {id: 'rental', label: '임대수익률'}],
  tax: [{id: 'vat', label: '부가세'}, {id: 'interest', label: '세후 이자'}],
  stock: [{id: 'trade', label: '매매손익'}, {id: 'average', label: '평균단가'}],
} as const;

export type EconomyCategory = keyof typeof categories;
type ToolId = (typeof categories)[EconomyCategory][number]['id'];
type FieldUnit = '원' | '%' | '개월' | '주';
type Field = {
  id: string;
  label: string;
  unit: FieldUnit;
  placeholder: string;
  minimum?: number;
  maximum?: number;
  optional?: boolean;
  wide?: boolean;
  advanced?: boolean;
};
type Metric = readonly [label: string, value: number, unit?: FieldUnit];
type Result = {value: number; unit?: FieldUnit; decimal?: boolean; rows: Metric[]};
type Draft = {values: Record<string, string>; option: number};
type Tool = {
  fields: Field[];
  heading: string | readonly string[];
  note: string;
  initial?: Record<string, string>;
  options?: {label: string; labels: readonly string[]; segmented?: boolean};
  calculate: (values: Record<string, number>, option: number) => Result | string;
};

const loanMethods: readonly LoanRepaymentMethod[] = ['amortized', 'principal', 'bullet'];
const stockPriceLimit = 4_000_000_000;
const limits: Record<FieldUnit, number> = {'원': 1_000_000_000_000, '%': 100, '개월': 1200, '주': 1_000_000};
const whole = new Intl.NumberFormat('ko-KR', {maximumFractionDigits: 0});
const decimal = new Intl.NumberFormat('ko-KR', {maximumFractionDigits: 2});

const tools: Record<ToolId, Tool> = {
  loan: {
    heading: ['월 상환액', '첫 달 상환액', '월 이자'],
    fields: [
      {id: 'principal', label: '대출금액', unit: '원', placeholder: '300,000,000', wide: true},
      {id: 'annualRate', label: '연 금리', unit: '%', placeholder: '4.5', minimum: 0},
      {id: 'months', label: '상환 기간', unit: '개월', placeholder: '360'},
    ],
    options: {label: '상환 방식', labels: ['원리금균등', '원금균등', '만기일시']},
    note: '고정금리와 매월 상환을 기준으로 거치기간 없이 계산해요.',
    calculate({principal, annualRate, months}, option) {
      const method = loanMethods[option];
      const {monthly, lastPayment, totalInterest, totalPayment} = calculateLoanRepayment({principal, annualRate, months, method});
      const rows: Metric[] = [['총 이자', totalInterest], ['총 상환액', totalPayment]];
      if (method !== 'amortized') rows.unshift([method === 'bullet' ? '만기 상환액' : '마지막 달 상환액', lastPayment]);
      return {value: monthly, rows};
    },
  },
  rental: {
    heading: '연 임대수익률',
    fields: [
      {id: 'purchase', label: '매입가', unit: '원', placeholder: '300,000,000'},
      {id: 'deposit', label: '임대보증금', unit: '원', placeholder: '30,000,000', optional: true},
      {id: 'monthlyRent', label: '월 임대료', unit: '원', placeholder: '1,200,000', minimum: 0},
      {id: 'annualCosts', label: '연 비용', unit: '원', placeholder: '1,200,000', optional: true},
    ],
    note: '매입가에서 보증금을 뺀 금액을 기준으로, 12개월 임대료에서 입력한 연 비용을 차감해요.',
    calculate({purchase, deposit, monthlyRent, annualCosts}) {
      const result = calculateRentalYield({purchase, deposit, monthlyRent, annualCosts});
      if (!result) return '임대보증금은 매입가보다 작아야 해요.';
      return {value: result.annualYield, unit: '%', rows: [
        ['보증금 차감 매입가', result.investment], ['연 임대료', result.annualIncome], ['연 순임대수익', result.annualProfit],
      ]};
    },
  },
  vat: {
    heading: '부가세',
    fields: [{id: 'amount', label: '입력 금액', unit: '원', placeholder: '110,000', wide: true, minimum: 0}],
    options: {label: '입력 금액 유형', labels: ['부가세 별도', '부가세 포함'], segmented: true},
    note: '일반과세 거래의 부가세 10% 기준이에요. 세액은 원 단위로 반올림해요.',
    calculate({amount}, option) {
      const {tax, supply, total} = calculateVat(amount, option === 1);
      return {value: tax, rows: [['공급가액', supply], ['합계 금액', total]]};
    },
  },
  interest: {
    heading: '세후 이자',
    fields: [
      {id: 'gross', label: '세전 이자', unit: '원', placeholder: '100,000', minimum: 0},
      {id: 'rate', label: '적용 세율', unit: '%', placeholder: '15.4', minimum: 0},
    ],
    initial: {rate: '15.4'},
    note: '일반과세 예금 세율 15.4%가 기본값이에요. 입력한 세율로 예상 세액을 계산해요.',
    calculate({gross, rate}) {
      const {tax, net} = calculateNetInterest(gross, rate);
      return {value: net, rows: [['세전 이자', gross], ['예상 세액', tax]]};
    },
  },
  trade: {
    heading: '예상 매매손익',
    fields: [
      {id: 'buyPrice', label: '1주 매수가', unit: '원', placeholder: '50,000', maximum: stockPriceLimit},
      {id: 'sellPrice', label: '1주 매도가', unit: '원', placeholder: '55,000', minimum: 0, maximum: stockPriceLimit},
      {id: 'shares', label: '거래 수량', unit: '주', placeholder: '100', wide: true},
      {id: 'buyFee', label: '매수 수수료', unit: '원', placeholder: '0', optional: true, advanced: true},
      {id: 'sellCosts', label: '매도 수수료·세금', unit: '원', placeholder: '0', optional: true, advanced: true},
    ],
    note: '매수 수수료는 매수원가에 더하고, 매도 비용은 매도대금에서 차감해요.',
    calculate({buyPrice, sellPrice, shares, buyFee, sellCosts}) {
      const {cost, proceeds, profit, returnRate} = calculateStockReturn({buyPrice, sellPrice, shares, buyFee, sellCosts});
      return {value: profit, rows: [['수익률', returnRate, '%'], ['매수원가', cost], ['매도 실수령액', proceeds]]};
    },
  },
  average: {
    heading: '변경 후 평균단가',
    fields: [
      {id: 'heldPrice', label: '보유 평균단가', unit: '원', placeholder: '50,000', maximum: stockPriceLimit},
      {id: 'heldShares', label: '보유 수량', unit: '주', placeholder: '100'},
      {id: 'addPrice', label: '추가 매수가', unit: '원', placeholder: '42,000', maximum: stockPriceLimit},
      {id: 'addShares', label: '추가 수량', unit: '주', placeholder: '50'},
    ],
    note: '보유분과 추가 매수분의 매수금액을 합산해 전체 수량으로 나눠요.',
    calculate({heldPrice, heldShares, addPrice, addShares}) {
      const {average, shares, total} = calculateAverageStockPrice({heldPrice, heldShares, addPrice, addShares});
      return {value: average, decimal: true, rows: [['전체 수량', shares, '주'], ['합계 매수금액', total]]};
    },
  },
};

function readNumber(field: Field, raw: string) {
  if (!raw.trim()) return field.optional ? 0 : null;
  const input = raw.trim();
  const pattern = field.unit === '%'
    ? /^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/
    : /^(?:\d+|\d{1,3}(?:,\d{3})+)$/;
  if (!pattern.test(input)) return null;
  const value = Number(input.replaceAll(',', ''));
  return value >= (field.minimum ?? (field.optional ? 0 : 1)) && value <= (field.maximum ?? limits[field.unit]) ? value : null;
}

function formatMetric(value: number, unit: FieldUnit = '원', precise = false) {
  const formatter = precise || unit === '%' ? decimal : whole;
  const rounded = formatter.format(value);
  return (rounded === '-0' ? '0' : rounded) + unit;
}

export function LedgerEconomyCalculator({category}: {category: EconomyCategory | null}) {
  const [selection, setSelection] = useState<Partial<Record<EconomyCategory, ToolId>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<ToolId, Draft>>>({});
  const id = useId();
  if (!category) return null;

  const available = categories[category];
  const active = selection[category] ?? available[0].id;
  const tool = tools[active];
  const initial = {values: tool.initial ?? {}, option: 0};
  const draft = drafts[active] ?? initial;
  const {values, option} = draft;
  const heading = typeof tool.heading === 'string' ? tool.heading : tool.heading[option];
  const inputs = tool.fields.map(field => {
    const raw = values[field.id] ?? '';
    const value = readNumber(field, raw);
    return {field, raw, value, invalid: value === null && raw.trim() !== ''};
  });
  const complete = inputs.every(input => input.value !== null);
  const computed = complete
    ? tool.calculate(Object.fromEntries(inputs.map(({field, value}) => [field.id, value ?? 0])), option)
    : null;
  const result = typeof computed === 'string' ? null : computed;
  const message = typeof computed === 'string' ? computed
    : inputs.some(input => input.invalid) ? '입력한 값을 확인해 주세요.' : '';

  function updateDraft(update: (previous: Draft) => Draft) {
    setDrafts(previous => ({...previous, [active]: update(previous[active] ?? initial)}));
  }

  function changeValue(fieldId: string, text: string) {
    updateDraft(current => ({...current, values: {...current.values, [fieldId]: text}}));
  }

  function renderField({field, raw, value, invalid}: typeof inputs[number]) {
    const inputId = id + '-' + active + '-' + field.id;
    const error = field.unit === '%'
      ? '0~100% 범위에서 소수 둘째 자리까지 입력해 주세요.'
      : `${whole.format(field.minimum ?? (field.optional ? 0 : 1))}~${formatMetric(field.maximum ?? limits[field.unit], field.unit)} 범위의 정수를 입력해 주세요.`;
    return <div key={field.id} className="economy-field" data-wide={field.wide || undefined}>
      <label htmlFor={inputId}>{field.label}{field.optional && <small> 선택</small>}</label>
      <div className="economy-input">
        <input id={inputId} type="text" value={raw} placeholder={field.placeholder}
          inputMode={field.unit === '%' ? 'decimal' : 'numeric'} maxLength={24}
          aria-invalid={invalid || undefined} aria-required={!field.optional}
          aria-describedby={inputId + '-unit' + (invalid ? ' ' + inputId + '-error' : '')}
          onChange={event => changeValue(field.id, event.target.value)}
          onFocus={() => {
            if (value !== null && raw.includes(',')) changeValue(field.id, String(value));
          }}
          onBlur={() => {
            if (value === null || !raw.trim()) return;
            changeValue(field.id, (field.unit === '%' ? decimal : whole).format(value));
          }}/>
        <span id={inputId + '-unit'}>{field.unit}</span>
      </div>
      {invalid && <small id={inputId + '-error'} className="economy-field-error">{error}</small>}
    </div>;
  }

  const advanced = inputs.filter(input => input.field.advanced);
  return <div className="ledger-economy">
    <div className="economy-tool-switch" role="group" aria-label="계산 도구">
      {available.map(({id: toolId, label}) => <button key={toolId} type="button" aria-pressed={active === toolId}
        onClick={() => setSelection(previous => ({...previous, [category]: toolId}))}>{label}</button>)}
    </div>
    <div className="economy-layout" key={active}>
      <div className="economy-form">
        {tool.options && (tool.options.segmented
          ? <div className="economy-option-switch" role="group" aria-label={tool.options.label}>
            {tool.options.labels.map((label, index) => <button key={label} type="button" aria-pressed={option === index}
              onClick={() => updateDraft(current => ({...current, option: index}))}>{label}</button>)}
          </div>
          : <label className="economy-method">{tool.options.label}
            <select value={option} onChange={event => {
              const selected = Number(event.target.value);
              updateDraft(current => ({...current, option: selected}));
            }}>
              {tool.options.labels.map((label, index) => <option key={label} value={index}>{label}</option>)}
            </select>
          </label>)}
        <div className="economy-fields">{inputs.filter(input => !input.field.advanced).map(renderField)}</div>
        {!!advanced.length && <details className="economy-advanced">
          <summary>거래 비용 입력 <small>선택</small></summary>
          <div className="economy-fields">{advanced.map(renderField)}</div>
        </details>}
      </div>
      <div className="economy-results">
        <div className="economy-result">
          <span>{heading}</span>
          <output aria-label={heading} data-negative={result && result.value < 0 ? true : undefined}>
            {result ? formatMetric(result.value, result.unit, result.decimal) : '—'}
          </output>
          {!result && <small aria-live="polite">{message || '값을 입력하면 바로 계산돼요.'}</small>}
        </div>
        {result && <dl>{result.rows.map(([label, value, unit]) => <div key={label}>
          <dt>{label}</dt><dd>{formatMetric(value, unit)}</dd>
        </div>)}</dl>}
      </div>
    </div>
    <p className="economy-note">{tool.note}</p>
  </div>;
}
