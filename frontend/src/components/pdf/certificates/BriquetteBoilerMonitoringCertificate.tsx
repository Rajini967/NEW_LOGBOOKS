import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { PDFHeader } from '../PDFHeader';

type BriquettePdfLog = {
  id?: string;
  equipmentId?: string;
  date?: string;
  time?: string;
  timestamp?: Date;
  steamPressure?: number | null;
  furnacePressureMmwc?: number | null;
  idFanOpPercent?: number | null;
  paDamperPosition1?: number | null;
  paDamperPosition2?: number | null;
  meteringScrewPercent?: number | null;
  steamReadingTon?: number | null;
  steamFlowKgHr?: number | null;
  stackTemp?: number | null;
  furnaceTemp?: number | null;
  hotAirTemp?: string | number | null;
  feedPump12?: string | number | null;
  operatorSignDate?: string | null;

  feedWaterPh?: number | null;
  feedWaterHardnessPpm?: number | null;
  feedWaterTdsPpm?: number | null;
  boilerWaterPh?: number | null;
  boilerWaterHardnessPpm?: number | null;
  boilerWaterTdsPpm?: number | null;
  totalSteamIn1Day?: string | number | null;
  totalSteamFlowRatio?: string | number | null;
  verifiedSignDate?: string | null;
};

type Props = {
  data: {
    logs: BriquettePdfLog[];
    approvedBy?: string;
    printedBy?: string;
    recordingFrequency?: string;
    /** yyyy-MM-dd — when set, restricts grid to this day (Reports export). */
    reportDate?: string;
  };
};

const styles = StyleSheet.create({
  page: {
    padding: 18,
    fontSize: 6,
    fontFamily: 'Helvetica',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  title: {
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'center',
    flexGrow: 1,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: 4,
    fontSize: 7,
  },
  metaItem: {
    width: '50%',
  },
  metaRight: {
    textAlign: 'right',
  },
  mainTable: {
    width: '100%',
    border: '1 solid #000',
  },
  row: {
    flexDirection: 'row',
    borderBottom: '1 solid #000',
    alignItems: 'stretch',
  },
  rowLast: {
    borderBottom: 'none',
  },
  cell: {
    paddingVertical: 2,
    paddingHorizontal: 2,
    borderRight: '1 solid #000',
    justifyContent: 'center',
    textAlign: 'center',
  },
  cellLast: {
    borderRight: 'none',
  },
  headerCell: {
    fontWeight: 'bold',
  },
  leftText: {
    textAlign: 'left',
  },
  waterBlock: {
    width: '100%',
    border: '1 solid #000',
    marginTop: 4,
  },
  waterMainRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
  },
  waterPanel: {
    width: '37%',
    borderRight: '1 solid #000',
  },
  waterPanelTitle: {
    fontSize: 8,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderBottom: '1 solid #000',
  },
  waterReadingHeaderRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #000',
    alignItems: 'center',
  },
  waterCornerCell: {
    width: '30%',
    borderRight: '1 solid #000',
    minHeight: 14,
  },
  waterReadingHead: {
    width: '23.33%',
    borderRight: '1 solid #000',
    paddingVertical: 3,
    paddingHorizontal: 1,
    fontSize: 6.5,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  waterReadingHeadLast: {
    borderRight: 'none',
  },
  waterDataRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #000',
    alignItems: 'center',
  },
  waterDataRowLast: {
    borderBottom: 'none',
  },
  waterLabel: {
    width: '30%',
    borderRight: '1 solid #000',
    paddingVertical: 4,
    paddingHorizontal: 3,
    fontSize: 7.5,
    textAlign: 'left',
  },
  waterValueCell: {
    width: '23.33%',
    borderRight: '1 solid #000',
    paddingVertical: 4,
    paddingHorizontal: 2,
    fontSize: 7.5,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  waterValueCellLast: {
    borderRight: 'none',
  },
  waterTotalBox: {
    width: '13%',
    borderRight: '1 solid #000',
    paddingVertical: 6,
    paddingHorizontal: 4,
    justifyContent: 'center',
    flexGrow: 0,
  },
  waterTotalBoxLast: {
    width: '13%',
    paddingVertical: 6,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  waterTotalLabel: {
    fontSize: 7,
    marginBottom: 2,
  },
  waterTotalValue: {
    fontSize: 8,
    fontWeight: 'bold',
  },
  footerRow: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 6,
  },
  signoffTable: {
    width: '100%',
    borderLeft: '1 solid #000',
    borderRight: '1 solid #000',
    borderBottom: '1 solid #000',
  },
  signoffRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #000',
    alignItems: 'center',
    minHeight: 16,
  },
  signoffRowLast: {
    borderBottom: 'none',
  },
  signoffDesc: {
    width: '74%',
    borderRight: '1 solid #000',
    paddingVertical: 3,
    paddingHorizontal: 4,
    fontSize: 7,
    textAlign: 'left',
  },
  signoffValue: {
    width: '26%',
    paddingVertical: 3,
    paddingHorizontal: 4,
    fontSize: 7,
    textAlign: 'left',
  },
});

const parseTimeToMinutes = (t: string): number => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return Number.POSITIVE_INFINITY;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return Number.POSITIVE_INFINITY;
  return hh * 60 + mm;
};

const fmt = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return s === 'null' || s === 'undefined' ? '' : s;
};

const naIfEmpty = (v: unknown): string => {
  const s = fmt(v);
  return s === '' ? 'NA' : s;
};

const threeReadingCells = (
  dayLogs: BriquettePdfLog[],
  key: keyof BriquettePdfLog,
): [string, string, string] =>
  [0, 1, 2].map((i) => naIfEmpty((dayLogs[i] as BriquettePdfLog | undefined)?.[key])) as [
    string,
    string,
    string,
  ];

const lastDefinedTotal = (
  dayLogs: BriquettePdfLog[],
  key: 'totalSteamIn1Day' | 'totalSteamFlowRatio',
): string => {
  for (let i = dayLogs.length - 1; i >= 0; i--) {
    const v = dayLogs[i]?.[key];
    if (v !== null && v !== undefined && String(v).trim() !== '') return fmt(v);
  }
  return naIfEmpty(dayLogs[0]?.[key]);
};

function WaterParameterPanel({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; readings: [string, string, string] }[];
}) {
  return (
    <View style={styles.waterPanel} wrap={false}>
      <Text style={styles.waterPanelTitle}>{title}</Text>
      <View style={styles.waterReadingHeaderRow} wrap={false}>
        <Text style={styles.waterCornerCell}> </Text>
        <Text style={styles.waterReadingHead}>Reading 1</Text>
        <Text style={styles.waterReadingHead}>Reading 2</Text>
        <Text style={[styles.waterReadingHead, styles.waterReadingHeadLast]}>Reading 3</Text>
      </View>
      {rows.map((r, idx) => (
        <View
          key={r.label}
          style={[styles.waterDataRow, idx === rows.length - 1 && styles.waterDataRowLast]}
          wrap={false}
        >
          <Text style={styles.waterLabel}>{r.label}</Text>
          <Text style={styles.waterValueCell}>{r.readings[0]}</Text>
          <Text style={styles.waterValueCell}>{r.readings[1]}</Text>
          <Text style={[styles.waterValueCell, styles.waterValueCellLast]}>{r.readings[2]}</Text>
        </View>
      ))}
    </View>
  );
}

export function BriquetteBoilerMonitoringCertificate({ data }: Props) {
  const rawLogs = (data.logs || []) as BriquettePdfLog[];
  const reportDay = data.reportDate?.trim();
  const logs =
    reportDay
      ? rawLogs.filter(
          (l) =>
            l.timestamp instanceof Date &&
            !Number.isNaN(l.timestamp.getTime()) &&
            format(l.timestamp, 'yyyy-MM-dd') === reportDay,
        )
      : rawLogs;

  const equipmentId = logs[0]?.equipmentId || '—';
  const dateLabel =
    logs[0]?.timestamp && logs[0].timestamp instanceof Date && !Number.isNaN(logs[0].timestamp.getTime())
      ? format(logs[0].timestamp, 'dd/MM/yyyy')
      : fmt(logs[0]?.date) || '—';

  const sorted = [...logs].sort((a, b) => parseTimeToMinutes(fmt(a.time)) - parseTimeToMinutes(fmt(b.time)));
  const lastLog = sorted[sorted.length - 1];
  const lastTime = fmt(lastLog?.time);
  const signDateTime = dateLabel && lastTime ? `${dateLabel} ${lastTime}` : dateLabel;
  const doneBySignDateTime = fmt(lastLog?.operatorSignDate) || (signDateTime ? signDateTime : '-');
  const approvedBySignDateTime = data.approvedBy ? `${data.approvedBy}${signDateTime ? ` - ${signDateTime}` : ''}` : '-';
  const printedBySignDate = data.printedBy ? `${data.printedBy}${dateLabel ? ` - ${dateLabel}` : ''}` : '-';

  const feedRows = [
    { label: 'pH', readings: threeReadingCells(sorted, 'feedWaterPh') },
    { label: 'Hardness in ppm', readings: threeReadingCells(sorted, 'feedWaterHardnessPpm') },
    { label: 'TDS', readings: threeReadingCells(sorted, 'feedWaterTdsPpm') },
  ];
  const boilerRows = [
    { label: 'pH', readings: threeReadingCells(sorted, 'boilerWaterPh') },
    { label: 'Hardness in ppm', readings: threeReadingCells(sorted, 'boilerWaterHardnessPpm') },
    { label: 'TDS', readings: threeReadingCells(sorted, 'boilerWaterTdsPpm') },
  ];

  const cols: { key: keyof BriquettePdfLog | 'time'; label: string; width: string }[] = [
    { key: 'time', label: 'Time', width: '5%' },
    { key: 'steamPressure', label: 'Steam Pressure', width: '7%' },
    { key: 'furnacePressureMmwc', label: 'Furnace Pressure in mmWC', width: '9%' },
    { key: 'idFanOpPercent', label: 'ID Fan Op %', width: '6%' },
    { key: 'paDamperPosition1', label: 'PA Damper position 1', width: '7%' },
    { key: 'paDamperPosition2', label: 'PA Damper position 2', width: '7%' },
    { key: 'meteringScrewPercent', label: 'Metering Screw %', width: '7%' },
    { key: 'steamReadingTon', label: 'Steam Reading Ton', width: '7%' },
    { key: 'steamFlowKgHr', label: 'Steam Flow Kg/hr', width: '7%' },
    { key: 'stackTemp', label: 'Stack Temp', width: '6%' },
    { key: 'furnaceTemp', label: 'Furnace Temp', width: '6%' },
    { key: 'hotAirTemp', label: 'Hot Air Temp', width: '6%' },
    { key: 'feedPump12', label: 'Feed Pump 1/2', width: '6%' },
    { key: 'operatorSignDate', label: 'Operator Sign & Date', width: '14%' },
  ];

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <PDFHeader reportTitle="BOILER LOG BOOK REPORT" />

        <View style={styles.titleRow}>
          <Text style={styles.title}>Operating Log for Briquette Boiler STPH and STPH</Text>
        </View>

        <View style={styles.fieldRow}>
          <Text style={styles.metaItem}>Date: {dateLabel}</Text>
          <Text style={[styles.metaItem, styles.metaRight]}>Equipment Number: {equipmentId}</Text>
        </View>

        <View style={styles.mainTable} wrap={false}>
          <View style={styles.row} wrap={false}>
            {cols.map((c, idx) => (
              <Text
                key={`h-${c.key}`}
                style={[
                  styles.cell,
                  styles.headerCell,
                  { width: c.width },
                  idx === cols.length - 1 && styles.cellLast,
                ]}
              >
                {c.label}
              </Text>
            ))}
          </View>

          {sorted.map((l, i) => (
            <View key={l.id || `${fmt(l.time)}-${i}`} style={[styles.row, i === sorted.length - 1 && styles.rowLast]} wrap={false}>
              {cols.map((c, idx) => {
                const val = c.key === 'time' ? fmt(l.time) : fmt((l as any)[c.key]);
                return (
                  <Text
                    key={`${l.id || i}-${String(c.key)}`}
                    style={[
                      styles.cell,
                      { width: c.width },
                      idx === cols.length - 1 && styles.cellLast,
                      c.key === 'operatorSignDate' && styles.leftText,
                    ]}
                  >
                    {val}
                  </Text>
                );
              })}
            </View>
          ))}
        </View>

        <View style={styles.waterBlock} wrap={false}>
          <View style={styles.waterMainRow} wrap={false}>
            <WaterParameterPanel title="Feed Water parameters" rows={feedRows} />
            <WaterParameterPanel title="Boiler Water Parameters" rows={boilerRows} />
            <View style={styles.waterTotalBox} wrap={false}>
              <Text style={styles.waterTotalLabel}>Total Steam in a day:</Text>
              <Text style={styles.waterTotalValue}>{lastDefinedTotal(sorted, 'totalSteamIn1Day')}</Text>
            </View>
            <View style={styles.waterTotalBoxLast} wrap={false}>
              <Text style={styles.waterTotalLabel}>Total Steam Flow Ratio:</Text>
              <Text style={styles.waterTotalValue}>{lastDefinedTotal(sorted, 'totalSteamFlowRatio')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.signoffTable} wrap={false}>
          <View style={styles.signoffRow} wrap={false}>
            <Text style={styles.signoffDesc}>Done By (Sign & Date Time)</Text>
            <Text style={styles.signoffValue}>{doneBySignDateTime}</Text>
          </View>
          <View style={[styles.signoffRow, styles.signoffRowLast]} wrap={false}>
            <Text style={styles.signoffDesc}>Approved By (Sign & Date Time)</Text>
            <Text style={styles.signoffValue}>{approvedBySignDateTime}</Text>
          </View>
        </View>

        <View style={styles.footerRow} wrap={false}>
          <Text>Recording Frequency: {data.recordingFrequency || 'Once in every 01 hour'}</Text>
          <Text>Printed By (Sign & Date): {printedBySignDate}</Text>
        </View>
      </Page>
    </Document>
  );
}

