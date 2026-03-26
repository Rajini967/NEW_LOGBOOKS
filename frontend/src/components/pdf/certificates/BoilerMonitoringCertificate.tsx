import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { PDFHeader } from '../PDFHeader';

const styles = StyleSheet.create({
  page: {
    padding: 18,
    fontSize: 8,
    fontFamily: 'Helvetica',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 4,
    marginBottom: 4,
  },
  title: {
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    flexGrow: 1,
  },
  brandRight: {
    width: '18%',
    textAlign: 'right',
    fontSize: 8,
    fontWeight: 'bold',
  },
  brandLeft: {
    width: '18%',
  },
  metaTable: {
    width: '100%',
    border: '1 solid #000',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #000',
  },
  metaRowLast: {
    borderBottom: 'none',
  },
  metaCell: {
    paddingVertical: 2,
    paddingHorizontal: 3,
    borderRight: '1 solid #000',
    fontSize: 7,
  },
  metaCellLast: {
    borderRight: 'none',
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: 4,
    fontSize: 8,
  },
  metaItem: {
    width: '33.333%',
  },
  metaCenter: {
    textAlign: 'center',
  },
  metaRight: {
    textAlign: 'right',
  },
  freq: {
    marginBottom: 4,
    fontSize: 8,
  },
  table: {
    width: '100%',
    border: '1 solid #000',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #000',
    minHeight: 18,
    alignItems: 'stretch',
  },
  tableHeader: {
    fontWeight: 'bold',
  },
  tableCell: {
    paddingVertical: 3,
    paddingHorizontal: 3,
    fontSize: 7.5,
    borderRight: '1 solid #000',
    textAlign: 'left',
    justifyContent: 'center',
  },
  tableCellLast: {
    borderRight: 'none',
  },
  footer: {
    marginTop: 8,
    fontSize: 8,
  },
  footerLine: {
    marginBottom: 5,
  },
  descCell: {
    width: '30%',
  },
  rangeCell: {
    width: '15%',
    textAlign: 'center',
  },
  timeHeaderCell: {
    textAlign: 'center',
    fontWeight: 'bold',
  },
  timeCell: {
    textAlign: 'center',
  },
  lowerTable: {
    width: '100%',
    border: '1 solid #000',
    marginTop: 4,
  },
});

interface BoilerMonitoringData {
  approvedBy?: string;
  printedBy?: string;
  logs: Array<{
    date: string;
    time: string;
    equipmentId: string;
    // Hourly/shift parameters
    foHsdNgDayTankLevel?: number;
    feedWaterTankLevel?: number;
    foPreHeaterTemp?: number;
    burnerOilPressure?: number;
    burnerHeaterTemp?: number;
    boilerSteamPressure?: number;
    stackTemperature?: number;
    steamPressureAfterPrv?: number;
    feedWaterHardnessPpm?: number;
    feedWaterTdsPpm?: number;
    foHsdNgConsumption?: number;
    mobreyFunctioning?: string;
    manualBlowdownTime?: string;
    comment?: string;
    remarks?: string;
    checkedBy?: string;
  }>;
}

interface BoilerMonitoringCertificateProps {
  data: BoilerMonitoringData;
}

const normalizeTimeSlot = (t: string): string => {
  const m = String(t ?? '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return '';
  return `${h}:${String(mm).padStart(2, '0')}`;
};

const formatTimeColumnLabel = (normalizedKey: string): string => {
  const m = normalizedKey.match(/^(\d+):(\d{2})$/);
  if (!m) return normalizedKey;
  return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`;
};

export function BoilerMonitoringCertificate({ data }: BoilerMonitoringCertificateProps) {
  const logs = data.logs || [];
  const equipmentId = logs[0]?.equipmentId || '-';
  const reportDate = logs.find((l) => (l.date || '').trim())?.date || '';

  const parseTimeToMinutes = (t: string): number => {
    const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
    if (!m) return Number.POSITIVE_INFINITY;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return Number.POSITIVE_INFINITY;
    return hh * 60 + mm;
  };

  const timeSlots = Array.from(
    new Set(
      logs
        .map((l) => normalizeTimeSlot(l.time))
        .filter((k) => k && Number.isFinite(parseTimeToMinutes(k))),
    ),
  ).sort((a, b) => parseTimeToMinutes(a) - parseTimeToMinutes(b));

  const maxTimeCols = 8;
  const timeCols = timeSlots.slice(0, maxTimeCols);
  const timeColWidth = `${55 / Math.max(timeCols.length || 1, 1)}%`;

  type FieldKey =
    | 'foHsdNgDayTankLevel'
    | 'feedWaterTankLevel'
    | 'foPreHeaterTemp'
    | 'burnerOilPressure'
    | 'burnerHeaterTemp'
    | 'boilerSteamPressure'
    | 'stackTemperature'
    | 'steamPressureAfterPrv';

  type ShiftFieldKey =
    | 'feedWaterHardnessPpm'
    | 'feedWaterTdsPpm'
    | 'foHsdNgConsumption'
    | 'mobreyFunctioning'
    | 'manualBlowdownTime';

  /** Aligned with operational limits in BoilerLogBookPage (boilerLimits). */
  const rows: { label: string; range: string; key: FieldKey }[] = [
    { label: 'FO/HSD/NG Day tank level', range: 'NLT 200 L', key: 'foHsdNgDayTankLevel' },
    { label: 'Feed water tank level', range: 'NLT 3 KL', key: 'feedWaterTankLevel' },
    { label: 'FO Pre heater temp', range: '60 to 70°C', key: 'foPreHeaterTemp' },
    { label: 'Burner Oil pressure', range: '18 to 25 kg/cm²', key: 'burnerOilPressure' },
    { label: 'Burner heater temp', range: '110 to 130°C', key: 'burnerHeaterTemp' },
    { label: 'Boiler Steam Pressure', range: 'NLT 5 kg/cm²', key: 'boilerSteamPressure' },
    { label: 'Stack temp', range: '180 to 250°C', key: 'stackTemperature' },
    { label: 'Steam pressure after PRV', range: 'NLT 5 kg/cm²', key: 'steamPressureAfterPrv' },
  ];

  const shiftRows: { label: string; range: string; key: ShiftFieldKey }[] = [
    { label: 'Feed water Hardness (Starting of the Shift)', range: 'NMT 5 PPM', key: 'feedWaterHardnessPpm' },
    { label: 'Feed water TDS (Starting of the Shift)', range: 'NMT 700 PPM', key: 'feedWaterTdsPpm' },
    { label: 'FO/HSD/NG Consumption (Ending of the shift)', range: 'Actual', key: 'foHsdNgConsumption' },
    { label: 'Mobrey functioning', range: 'Yes / No', key: 'mobreyFunctioning' },
    { label: 'Manual Blow down (30 sec for every 4 hrs)', range: 'Actual time', key: 'manualBlowdownTime' },
  ];

  const valueAt = (timeKey: string, key: keyof BoilerMonitoringData['logs'][number]): string => {
    const hit = logs.find((l) => normalizeTimeSlot(l.time) === timeKey);
    const v = hit ? (hit as any)[key] : null;
    return v === null || v === undefined || v === '' ? '' : String(v);
  };

  const firstCheckedBy = logs.find((l) => (l.checkedBy || '').trim())?.checkedBy || '';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PDFHeader />

        <View style={styles.titleRow}>
          <Text style={styles.brandLeft}> </Text>
          <Text style={styles.title}>Equipment operation log: Boiler</Text>
          <Text style={styles.brandRight}>Dr.Reddy&apos;s</Text>
        </View>

        <View style={styles.metaTable} wrap={false}>
          <View style={styles.metaRow} wrap={false}>
            <Text style={[styles.metaCell, { width: '55%' }]}>Document No.: FORM-FT08-EN-0197</Text>
            <Text style={[styles.metaCell, styles.metaCellLast, { width: '45%' }]}>Version: 2.0, CURRENT</Text>
          </View>
          <View style={[styles.metaRow, styles.metaRowLast]} wrap={false}>
            <Text style={[styles.metaCell, { width: '55%' }]}>Reference SOP No.: SOP-FT01-EN-0083</Text>
            <Text style={[styles.metaCell, styles.metaCellLast, { width: '45%' }]}>
              Legacy Document No.: FORM-FT08-EN-0081
            </Text>
          </View>
        </View>

        <View style={styles.fieldRow}>
          <Text style={styles.metaItem}>Date: {reportDate || ' '}</Text>
          <Text style={[styles.metaItem, styles.metaCenter]}>Shift: </Text>
          <Text style={[styles.metaItem, styles.metaRight]}>Equipment Number: {equipmentId}</Text>
        </View>
        <Text style={styles.freq}>Recording Frequency: once in every 01 hour</Text>

        <View style={styles.table} wrap={false}>
          <View style={[styles.tableRow, styles.tableHeader]} wrap={false}>
            <Text style={[styles.tableCell, styles.descCell]}>Description</Text>
            <Text style={[styles.tableCell, styles.rangeCell]}>Range</Text>
            <Text
              style={[
                styles.tableCell,
                styles.tableCellLast,
                { width: '55%', textAlign: 'center', fontWeight: 'bold' },
              ]}
            >
              Time
            </Text>
          </View>

          <View style={[styles.tableRow, styles.tableHeader]} wrap={false}>
            <Text style={[styles.tableCell, styles.descCell]} />
            <Text style={[styles.tableCell, styles.rangeCell]} />
            {timeCols.map((t, i) => (
              <Text
                key={`t-h-${t}`}
                style={[
                  styles.tableCell,
                  { width: timeColWidth },
                  styles.timeHeaderCell,
                  i === timeCols.length - 1 && styles.tableCellLast,
                ]}
              >
                {formatTimeColumnLabel(t)}
              </Text>
            ))}
            {timeCols.length === 0 ? (
              <Text style={[styles.tableCell, { width: '55%' }, styles.tableCellLast]} />
            ) : null}
          </View>

          {rows.map((r) => (
            <View key={r.key} style={styles.tableRow} wrap={false}>
              <Text style={[styles.tableCell, styles.descCell]}>{r.label}</Text>
              <Text style={[styles.tableCell, styles.rangeCell]}>{r.range}</Text>
              {timeCols.map((t, i) => (
                <Text
                  key={`${r.key}-${t}`}
                  style={[
                    styles.tableCell,
                    { width: timeColWidth },
                    styles.timeCell,
                    i === timeCols.length - 1 && styles.tableCellLast,
                  ]}
                >
                  {valueAt(t, r.key)}
                </Text>
              ))}
              {timeCols.length === 0 ? (
                <Text style={[styles.tableCell, { width: '55%' }, styles.tableCellLast]} />
              ) : null}
            </View>
          ))}

          <View style={[styles.tableRow, { borderBottom: 'none' }]} wrap={false}>
            <Text style={[styles.tableCell, styles.descCell]}>Recorded by</Text>
            <Text style={[styles.tableCell, styles.rangeCell]} />
            {timeCols.length === 0 ? (
              <Text style={[styles.tableCell, styles.tableCellLast, { width: '55%' }]}>
                {firstCheckedBy || ' '}
              </Text>
            ) : (
              timeCols.map((t, i) => (
                <Text
                  key={`rec-by-${t}`}
                  style={[
                    styles.tableCell,
                    { width: timeColWidth },
                    styles.timeCell,
                    i === timeCols.length - 1 && styles.tableCellLast,
                  ]}
                >
                  {valueAt(t, 'checkedBy')}
                </Text>
              ))
            )}
          </View>
        </View>

        <View style={styles.lowerTable} wrap={false}>
          <View style={[styles.tableRow, styles.tableHeader]} wrap={false}>
            <Text style={[styles.tableCell, styles.descCell]}>Description</Text>
            <Text style={[styles.tableCell, styles.rangeCell]}>Range</Text>
            <Text
              style={[
                styles.tableCell,
                styles.tableCellLast,
                { width: '55%', textAlign: 'center', fontWeight: 'bold' },
              ]}
            >
              Value / Time
            </Text>
          </View>
          <View style={[styles.tableRow, styles.tableHeader]} wrap={false}>
            <Text style={[styles.tableCell, styles.descCell]} />
            <Text style={[styles.tableCell, styles.rangeCell]} />
            {timeCols.map((t, i) => (
              <Text
                key={`shift-h-${t}`}
                style={[
                  styles.tableCell,
                  { width: timeColWidth },
                  styles.timeHeaderCell,
                  i === timeCols.length - 1 && styles.tableCellLast,
                ]}
              >
                {formatTimeColumnLabel(t)}
              </Text>
            ))}
            {timeCols.length === 0 ? (
              <Text style={[styles.tableCell, { width: '55%' }, styles.tableCellLast]} />
            ) : null}
          </View>
          {shiftRows.map((r) => (
            <View key={r.key} style={styles.tableRow} wrap={false}>
              <Text style={[styles.tableCell, styles.descCell]}>{r.label}</Text>
              <Text style={[styles.tableCell, styles.rangeCell]}>{r.range}</Text>
              {timeCols.map((t, i) => (
                <Text
                  key={`${r.key}-${t}`}
                  style={[
                    styles.tableCell,
                    { width: timeColWidth },
                    styles.timeCell,
                    i === timeCols.length - 1 && styles.tableCellLast,
                  ]}
                >
                  {valueAt(t, r.key)}
                </Text>
              ))}
              {timeCols.length === 0 ? (
                <Text style={[styles.tableCell, { width: '55%' }, styles.tableCellLast]} />
              ) : null}
            </View>
          ))}
          <View style={styles.tableRow} wrap={false}>
            <Text style={[styles.tableCell, styles.descCell]}>Recorded by</Text>
            <Text style={[styles.tableCell, styles.rangeCell]} />
            {timeCols.length === 0 ? (
              <Text style={[styles.tableCell, styles.tableCellLast, { width: '55%' }]}>
                {firstCheckedBy || ' '}
              </Text>
            ) : (
              timeCols.map((t, i) => (
                <Text
                  key={`shift-rec-${t}`}
                  style={[
                    styles.tableCell,
                    { width: timeColWidth },
                    styles.timeCell,
                    i === timeCols.length - 1 && styles.tableCellLast,
                  ]}
                >
                  {valueAt(t, 'checkedBy')}
                </Text>
              ))
            )}
          </View>
          <View style={[styles.tableRow, { borderBottom: 'none' }]} wrap={false}>
            <Text style={[styles.tableCell, styles.descCell]}>Remarks</Text>
            <Text style={[styles.tableCell, styles.rangeCell]} />
            {timeCols.length === 0 ? (
              <Text style={[styles.tableCell, styles.tableCellLast, { width: '55%' }]}>
                {logs.find((l) => (l.remarks || '').toString().trim())?.remarks || ' '}
              </Text>
            ) : (
              timeCols.map((t, i) => (
                <Text
                  key={`shift-rm-${t}`}
                  style={[
                    styles.tableCell,
                    { width: timeColWidth },
                    styles.timeCell,
                    i === timeCols.length - 1 && styles.tableCellLast,
                  ]}
                >
                  {valueAt(t, 'remarks')}
                </Text>
              ))
            )}
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerLine}>Approved By: {data.approvedBy || '-'}</Text>
          <Text style={styles.footerLine}>Printed By: {data.printedBy || '-'}</Text>
        </View>
      </Page>
    </Document>
  );
}

