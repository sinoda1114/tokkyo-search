"use client";

import { DateField, DateRangePicker, FieldError, Label, RangeCalendar } from "@heroui/react";
import { getLocalTimeZone, parseDate, today, type DateValue } from "@internationalized/date";

interface DateRangeFieldProps {
  label: string;
  dateFrom: string;
  dateTo: string;
  onChange: (dateFrom: string, dateTo: string) => void;
  onBlur?: () => void;
  isInvalid?: boolean;
  errorMessage?: string;
}

interface PickerRange {
  start: DateValue;
  end: DateValue;
}

function toDateValue(value: string): DateValue | null {
  if (!value) {
    return null;
  }
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

/**
 * BigQuery検索の対象期間入力。開始日・終了日をひとつのカレンダーUI（HeroUI DateRangePicker）で選択させる。
 * 未来日は選択不可にする（公開特許は過去日にしか存在しないため）。
 */
export function DateRangeField({
  label,
  dateFrom,
  dateTo,
  onChange,
  onBlur,
  isInvalid,
  errorMessage,
}: DateRangeFieldProps) {
  const maxValue = today(getLocalTimeZone());
  const start = toDateValue(dateFrom);
  const end = toDateValue(dateTo);
  const value: PickerRange | null = start && end ? { start, end } : null;

  return (
    <DateRangePicker
      className="w-full"
      endName="dateTo"
      startName="dateFrom"
      isInvalid={isInvalid}
      maxValue={maxValue}
      value={value}
      onChange={(range) => {
        onChange(range?.start ? range.start.toString() : "", range?.end ? range.end.toString() : "");
      }}
      onBlur={onBlur}
    >
      <Label>{label}</Label>
      <DateField.Group fullWidth>
        <DateField.Input aria-label="開始日" slot="start">
          {(segment) => <DateField.Segment segment={segment} />}
        </DateField.Input>
        <DateRangePicker.RangeSeparator />
        <DateField.Input aria-label="終了日" slot="end">
          {(segment) => <DateField.Segment segment={segment} />}
        </DateField.Input>
        <DateField.Suffix>
          <DateRangePicker.Trigger>
            <DateRangePicker.TriggerIndicator />
          </DateRangePicker.Trigger>
        </DateField.Suffix>
      </DateField.Group>
      {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
      <DateRangePicker.Popover>
        <RangeCalendar aria-label={label} maxValue={maxValue}>
          <RangeCalendar.Header>
            <RangeCalendar.YearPickerTrigger>
              <RangeCalendar.YearPickerTriggerHeading />
              <RangeCalendar.YearPickerTriggerIndicator />
            </RangeCalendar.YearPickerTrigger>
            <RangeCalendar.NavButton slot="previous" />
            <RangeCalendar.NavButton slot="next" />
          </RangeCalendar.Header>
          <RangeCalendar.Grid>
            <RangeCalendar.GridHeader>
              {(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
            </RangeCalendar.GridHeader>
            <RangeCalendar.GridBody>{(date) => <RangeCalendar.Cell date={date} />}</RangeCalendar.GridBody>
          </RangeCalendar.Grid>
          <RangeCalendar.YearPickerGrid>
            <RangeCalendar.YearPickerGridBody>
              {({ year }) => <RangeCalendar.YearPickerCell year={year} />}
            </RangeCalendar.YearPickerGridBody>
          </RangeCalendar.YearPickerGrid>
        </RangeCalendar>
      </DateRangePicker.Popover>
    </DateRangePicker>
  );
}
