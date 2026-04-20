import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { PDFHeader } from '../PDFHeader';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 20,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: -10,
    marginBottom: 10,
  },
  table: {
    width: '100%',
    marginTop: 10,
    marginBottom: 20,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #000',
    minHeight: 24,
  },
  tableHeader: {
    backgroundColor: '#e0e0e0',
    fontWeight: 'bold',
    borderBottom: '2 solid #000',
  },
  tableCell: {
    padding: 4,
    fontSize: 8,
    borderRight: '1 solid #000',
    textAlign: 'center',
    overflow: 'hidden',
    lineHeight: 1.2,
  },
  tableCellLeft: {
    textAlign: 'left',
  },
  tableCellLast: {
    borderRight: 'none',
  },
  footer: {
    marginTop: 20,
    fontSize: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  footerLine: {
    marginBottom: 4,
    fontSize: 7.2,
  },
  footerLeft: {
    width: '44%',
    textAlign: 'left',
  },
  footerRight: {
    width: '56%',
    textAlign: 'right',
    fontSize: 7,
  },
  detailsTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 8,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  smallCell: {
    fontSize: 7,
    padding: 4,
  },
  emailCell: {
    fontSize: 5.5,
    padding: 2,
    lineHeight: 1.1,
  },
  remarksCell: {
    fontSize: 6.5,
    textAlign: 'left',
    lineHeight: 1.15,
  },
});

interface ChemicalMonitoringData {
  approvedBy?: string;
  printedBy?: string;
  recordingFrequency?: string;
  logs: Array<{
    date: string;
    time: string;
    equipmentName: string;
    chemicalName?: string;
    chemicalPercent?: number;
    solutionConcentration?: number;
    waterQty?: number;
    chemicalQty?: number;
    batchNo?: string;
    doneBy?: string;
    comment?: string;
    operatorName?: string;
    approvedAt?: string | null;
    secondaryApprovedAt?: string | null;
    raw?: any;
    remarks?: string;
    checkedBy?: string;
  }>;
}

interface ChemicalMonitoringCertificateProps {
  data: ChemicalMonitoringData;
}

export function ChemicalMonitoringCertificate({ data }: ChemicalMonitoringCertificateProps) {
  const equipmentId = (data.logs[0] as any)?.equipmentId || data.logs[0]?.equipmentName || '-';
  const wrapTight = (value: unknown, tokenSize = 14): string => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    return raw
      .split(/\s+/)
      .map((token) => {
        if (token.length <= tokenSize) return token;
        const chunks = token.match(new RegExp(`.{1,${tokenSize}}`, 'g'));
        return chunks ? chunks.join('\n') : token;
      })
      .join(' ');
  };
  const rowDateTime = (log: ChemicalMonitoringData['logs'][number]): string => {
    const d = (log.date || '').trim();
    const t = (log.time || '').trim();
    if (!d && !t) return '';
    if (d && t) return `${d} ${t}`;
    return d || t;
  };
  const doneByForRow = (log: ChemicalMonitoringData['logs'][number]): string => {
    const name = (log.checkedBy || '').trim();
    const dt = rowDateTime(log);
    if (!name) return '';
    return dt ? `${name} - ${dt}` : name;
  };
  const approvedByForRow = (log: ChemicalMonitoringData['logs'][number]): string =>
    (() => {
      const name =
        (log as any)?.approvedBy ||
        (log as any)?.approved_by_name ||
        (log as any)?.raw?.approved_by_name ||
        data.approvedBy ||
        '';
      const dt = rowDateTime(log);
      if (!name) return '-';
      return dt ? `${name} - ${dt}` : String(name);
    })();
  const printedBySignDate = (() => {
    const by = (data.printedBy || '').trim();
    if (!by) return '-';
    return `${by} - ${format(new Date(), 'dd/MM/yy HH:mm:ss')}`;
  })();
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PDFHeader reportTitle="CHEMICAL LOG BOOK REPORT" />
        
        <Text style={styles.title}>RAW DATA FOR CHEMICAL MONITORING</Text>
        <Text style={styles.subtitle}>Equipment ID: {equipmentId}</Text>

        <View style={styles.table}>
          {/* Header Row */}
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, { width: '7%' }]}>Date</Text>
            <Text style={[styles.tableCell, { width: '7%' }]}>Time</Text>
            <Text style={[styles.tableCell, { width: '11%' }]}>EqP Name</Text>
            <Text style={[styles.tableCell, { width: '9%' }]}>Chemical name</Text>
            <Text style={[styles.tableCell, { width: '7%' }]}>Chemical concentration %</Text>
            <Text style={[styles.tableCell, { width: '9%' }]}>Solution concentration %</Text>
            <Text style={[styles.tableCell, { width: '6%' }]}>Water Qty</Text>
            <Text style={[styles.tableCell, { width: '6%' }]}>Chemical Qty</Text>
            <Text style={[styles.tableCell, { width: '8%' }]}>Batch No</Text>
            <Text style={[styles.tableCell, { width: '10%' }]}>Remarks</Text>
            <Text style={[styles.tableCell, { width: '10%' }]}>Done By (Sign and Date)</Text>
            <Text style={[styles.tableCell, { width: '10%' }, styles.tableCellLast]}>Approved By (Sign and Date)</Text>
          </View>

          {/* Data Rows */}
          {data.logs.map((log, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: '7%' }]}>{log.date === 'Automatic' || !log.date ? 'Automatic' : log.date}</Text>
              <Text style={[styles.tableCell, { width: '7%' }]}>{log.time === 'Automatic' || !log.time ? 'Automatic' : log.time}</Text>
              <Text style={[styles.tableCell, styles.tableCellLeft, { width: '11%' }]}>
                {log.equipmentName || ''}
              </Text>
              <Text style={[styles.tableCell, { width: '9%' }]}>
                {log.chemicalName || ''}
              </Text>
              <Text style={[styles.tableCell, { width: '7%' }]}>
                {log.chemicalPercent != null && log.chemicalPercent !== ''
                  ? `${log.chemicalPercent}%`
                  : ''}
              </Text>
              <Text style={[styles.tableCell, { width: '9%' }]}>
                {log.solutionConcentration != null && log.solutionConcentration !== ''
                  ? `${log.solutionConcentration} %`
                  : ''}
              </Text>
              <Text style={[styles.tableCell, { width: '6%' }]}>
                {log.waterQty != null && log.waterQty !== '' ? `${log.waterQty} L` : ''}
              </Text>
              <Text style={[styles.tableCell, { width: '6%' }]}>
                {log.chemicalQty != null && log.chemicalQty !== '' ? `${log.chemicalQty} G` : ''}
              </Text>
              <Text style={[styles.tableCell, { width: '8%' }]}>
                {log.batchNo || ''}
              </Text>
              <Text style={[styles.tableCell, styles.remarksCell, { width: '10%' }]}>
                {wrapTight(log.remarks || '-', 10)}
              </Text>
              <Text style={[styles.tableCell, styles.emailCell, { width: '10%' }]}>
                {wrapTight(doneByForRow(log), 10)}
              </Text>
              <Text style={[styles.tableCell, styles.emailCell, { width: '10%' }, styles.tableCellLast]}>
                {wrapTight(approvedByForRow(log), 10)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerLine, styles.footerLeft]}>
            Recording Frequency: {data.recordingFrequency || 'Once in every 01 hour'}
          </Text>
          <Text style={[styles.footerLine, styles.footerRight]}>
            Printed By (Sign and Date): {printedBySignDate}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

