import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { PDFHeader } from '../PDFHeader';

/** Column widths — must total 100% (landscape A4). */
const W = {
  date: '5%',
  time: '4%',
  equipment: '15%',
  category: '6%',
  filterNo: '7%',
  micron: '5%',
  fsize: '8%',
  installed: '6%',
  intDue: '5%',
  clnDue: '5%',
  repDue: '5%',
  remarks: '11%',
  doneBy: '9%',
  apprBy: '9%',
} as const;

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 8,
    fontFamily: 'Helvetica',
  },
  title: {
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 2,
  },
  subsubtitle: {
    fontSize: 9,
    textAlign: 'center',
    marginBottom: 8,
    color: '#333333',
  },
  table: {
    width: '100%',
    marginTop: 6,
    marginBottom: 12,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #000',
    alignItems: 'stretch',
  },
  tableHeader: {
    backgroundColor: '#e8e8e8',
    fontWeight: 'bold',
    borderBottom: '2 solid #000',
  },
  tableCell: {
    padding: 4,
    fontSize: 7,
    borderRight: '1 solid #000',
    textAlign: 'center',
    justifyContent: 'center',
  },
  tableCellLeft: {
    textAlign: 'left',
  },
  tableCellLast: {
    borderRight: 'none',
  },
  cellHeader: {
    fontSize: 7,
    fontWeight: 'bold',
  },
  filterNoCell: {
    fontSize: 8,
    fontWeight: 'bold',
  },
  footer: {
    marginTop: 16,
    fontSize: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  footerRight: {
    textAlign: 'right',
  },
});

export interface FilterMonitoringLog {
  date: string;
  time: string;
  equipmentId: string;
  equipmentDisplayName?: string;
  category: string;
  filterNo: string;
  filterMicron?: string;
  filterSize?: string;
  tagInfo?: string;
  activityType?: string;
  installedDate: string;
  integrityDoneDate?: string;
  integrityDueDate: string;
  cleaningDoneDate?: string;
  cleaningDueDate: string;
  replacementDueDate: string;
  remarks?: string;
  checkedBy?: string;
  approvedByName?: string;
}

interface FilterMonitoringData {
  approvedBy?: string;
  printedBy?: string;
  recordingFrequency?: string;
  logs: FilterMonitoringLog[];
}

interface FilterMonitoringCertificateProps {
  data: FilterMonitoringData;
}

export function FilterMonitoringCertificate({ data }: FilterMonitoringCertificateProps) {
  const first = data.logs[0];
  const equipTitle =
    (first?.equipmentDisplayName && String(first.equipmentDisplayName).trim()) ||
    first?.equipmentId ||
    '—';
  const signDateForRow = (log: FilterMonitoringLog): string => {
    const d = (log.date || '').trim();
    const t = (log.time || '').trim();
    if (d && t) return `${d} ${t}`;
    return d || t || '';
  };
  const doneByForRow = (log: FilterMonitoringLog): string => {
    const name = (log.checkedBy || '').trim();
    const dt = signDateForRow(log);
    if (!name) return '—';
    return dt ? `${name} - ${dt}` : name;
  };
  const approvedByForRow = (log: FilterMonitoringLog): string => {
    const name = (log.approvedByName || '').trim();
    const dt = signDateForRow(log);
    if (!name) return '—';
    return dt ? `${name} - ${dt}` : name;
  };
  const printedBySignDate = (() => {
    const by = (data.printedBy || '').trim();
    if (!by) return '—';
    return `${by} - ${format(new Date(), 'dd/MM/yy HH:mm:ss')}`;
  })();

  const renderRow = (log: FilterMonitoringLog, index: number, isHeader: boolean) => (
    <View key={isHeader ? 'hdr' : `row-${index}`} style={[styles.tableRow, isHeader && styles.tableHeader]}>
      <Text style={[styles.tableCell, { width: W.date }, isHeader && styles.cellHeader]} wrap>
        {isHeader ? 'Date' : log.date || '—'}
      </Text>
      <Text style={[styles.tableCell, { width: W.time }, isHeader && styles.cellHeader]} wrap>
        {isHeader ? 'Time' : log.time || '—'}
      </Text>
      <Text
        style={[styles.tableCell, styles.tableCellLeft, { width: W.equipment }, isHeader && styles.cellHeader]}
        wrap
      >
        {isHeader ? 'Equipment' : log.equipmentDisplayName || log.equipmentId || '—'}
      </Text>
      <Text
        style={[styles.tableCell, styles.tableCellLeft, { width: W.category }, isHeader && styles.cellHeader]}
        wrap
      >
        {isHeader ? 'Category' : log.category || '—'}
      </Text>
      <Text
        style={[
          styles.tableCell,
          { width: W.filterNo },
          isHeader ? styles.cellHeader : styles.filterNoCell,
        ]}
        wrap
      >
        {isHeader ? 'Filter No' : log.filterNo || '—'}
      </Text>
      <Text style={[styles.tableCell, { width: W.micron }, isHeader && styles.cellHeader]} wrap>
        {isHeader ? 'Micron' : log.filterMicron ?? '—'}
      </Text>
      <Text style={[styles.tableCell, { width: W.fsize }, isHeader && styles.cellHeader]} wrap>
        {isHeader ? 'Filter size' : log.filterSize ?? '—'}
      </Text>
      <Text style={[styles.tableCell, { width: W.installed }, isHeader && styles.cellHeader]} wrap>
        {isHeader ? 'Installed' : log.installedDate || '—'}
      </Text>
      <Text style={[styles.tableCell, { width: W.intDue }, isHeader && styles.cellHeader]} wrap>
        {isHeader ? 'Int. due' : log.integrityDueDate || '—'}
      </Text>
      <Text style={[styles.tableCell, { width: W.clnDue }, isHeader && styles.cellHeader]} wrap>
        {isHeader ? 'Cln. due' : log.cleaningDueDate || '—'}
      </Text>
      <Text style={[styles.tableCell, { width: W.repDue }, isHeader && styles.cellHeader]} wrap>
        {isHeader ? 'Repl. due' : log.replacementDueDate || '—'}
      </Text>
      <Text
        style={[styles.tableCell, styles.tableCellLeft, { width: W.remarks }, isHeader && styles.cellHeader]}
        wrap
      >
        {isHeader ? 'Remarks' : log.remarks || '—'}
      </Text>
      <Text
        style={[styles.tableCell, styles.tableCellLeft, { width: W.doneBy }, isHeader && styles.cellHeader]}
        wrap
      >
        {isHeader ? 'Done By (Sign and Date)' : doneByForRow(log)}
      </Text>
      <Text
        style={[
          styles.tableCell,
          styles.tableCellLeft,
          { width: W.apprBy },
          isHeader && styles.cellHeader,
          styles.tableCellLast,
        ]}
        wrap
      >
        {isHeader ? 'Approved By (Sign and Date)' : approvedByForRow(log)}
      </Text>
    </View>
  );

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <PDFHeader reportTitle="FILTER LOG BOOK REPORT" />

        <Text style={styles.title}>RAW DATA FOR FILTER MONITORING</Text>
        <Text style={styles.subtitle}>Equipment: {equipTitle}</Text>
        {first?.filterNo ? (
          <Text style={styles.subsubtitle}>Filter number: {first.filterNo}</Text>
        ) : null}

        <View style={styles.table}>
          {renderRow(data.logs[0] || ({} as FilterMonitoringLog), -1, true)}
          {data.logs.map((log, index) => renderRow(log, index, false))}
        </View>

        <View style={styles.footer}>
          <Text>Recording Frequency: {data.recordingFrequency || 'Once in every 01 hour'}</Text>
          <Text style={styles.footerRight}>Printed By (Sign and Date): {printedBySignDate}</Text>
        </View>
      </Page>
    </Document>
  );
}
