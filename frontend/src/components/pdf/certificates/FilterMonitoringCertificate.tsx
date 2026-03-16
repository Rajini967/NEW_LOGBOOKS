import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
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
  table: {
    width: '100%',
    marginTop: 10,
    marginBottom: 20,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #000',
    minHeight: 20,
  },
  tableHeader: {
    backgroundColor: '#e0e0e0',
    fontWeight: 'bold',
    borderBottom: '2 solid #000',
  },
  tableCell: {
    padding: 6,
    fontSize: 8,
    borderRight: '1 solid #000',
    textAlign: 'center',
  },
  tableCellLeft: {
    textAlign: 'left',
  },
  tableCellLast: {
    borderRight: 'none',
  },
  footer: {
    marginTop: 20,
    fontSize: 10,
  },
  footerLine: {
    marginBottom: 5,
  },
});

export interface FilterMonitoringLog {
  date: string;
  time: string;
  equipmentId: string;
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
}

interface FilterMonitoringData {
  approvedBy?: string;
  printedBy?: string;
  logs: FilterMonitoringLog[];
}

interface FilterMonitoringCertificateProps {
  data: FilterMonitoringData;
}

export function FilterMonitoringCertificate({ data }: FilterMonitoringCertificateProps) {
  const footerRemarks =
    data.logs.find((log) => (log.remarks || '').toString().trim().length > 0)?.remarks || '';
  const doneBy = data.logs[0]?.checkedBy ?? '';
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PDFHeader />

        <Text style={styles.title}>RAW DATA FOR FILTER MONITORING</Text>

        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, { width: '8%' }]}>Date</Text>
            <Text style={[styles.tableCell, { width: '6%' }]}>Time</Text>
            <Text style={[styles.tableCell, styles.tableCellLeft, { width: '10%' }]}>Equipment ID</Text>
            <Text style={[styles.tableCell, styles.tableCellLeft, { width: '10%' }]}>Category</Text>
            <Text style={[styles.tableCell, { width: '8%' }]}>Filter No</Text>
            <Text style={[styles.tableCell, { width: '6%' }]}>Filter Micron</Text>
            <Text style={[styles.tableCell, { width: '10%' }]}>Filter Size</Text>
            <Text style={[styles.tableCell, { width: '8%' }]}>Installed Date</Text>
            <Text style={[styles.tableCell, { width: '8%' }]}>Integrity Due</Text>
            <Text style={[styles.tableCell, { width: '8%' }]}>Cleaning Due</Text>
            <Text style={[styles.tableCell, { width: '8%' }]}>Replacement Due</Text>
            <Text style={[styles.tableCell, { width: '6%' }]}>Remarks</Text>
            <Text style={[styles.tableCell, { width: '10%' }, styles.tableCellLast]}>Done By</Text>
          </View>

          {data.logs.map((log, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: '8%' }]}>{log.date || '-'}</Text>
              <Text style={[styles.tableCell, { width: '6%' }]}>{log.time || '-'}</Text>
              <Text style={[styles.tableCell, styles.tableCellLeft, { width: '10%' }]}>{log.equipmentId || '-'}</Text>
              <Text style={[styles.tableCell, styles.tableCellLeft, { width: '10%' }]}>{log.category || '-'}</Text>
              <Text style={[styles.tableCell, { width: '8%' }]}>{log.filterNo || '-'}</Text>
              <Text style={[styles.tableCell, { width: '6%' }]}>{log.filterMicron ?? '-'}</Text>
              <Text style={[styles.tableCell, { width: '10%' }]}>{log.filterSize ?? '-'}</Text>
              <Text style={[styles.tableCell, { width: '8%' }]}>{log.installedDate || '-'}</Text>
              <Text style={[styles.tableCell, { width: '8%' }]}>{log.integrityDueDate || '-'}</Text>
              <Text style={[styles.tableCell, { width: '8%' }]}>{log.cleaningDueDate || '-'}</Text>
              <Text style={[styles.tableCell, { width: '8%' }]}>{log.replacementDueDate || '-'}</Text>
              <Text style={[styles.tableCell, { width: '6%' }]}>{log.remarks || '-'}</Text>
              <Text style={[styles.tableCell, styles.tableCellLeft, { width: '10%' }, styles.tableCellLast]}>{log.checkedBy || '-'}</Text>
            </View>
          ))}

          {Array.from({ length: Math.max(0, 10 - data.logs.length) }).map((_, index) => (
            <View key={`empty-${index}`} style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: '8%' }]}></Text>
              <Text style={[styles.tableCell, { width: '6%' }]}></Text>
              <Text style={[styles.tableCell, { width: '10%' }]}></Text>
              <Text style={[styles.tableCell, { width: '10%' }]}></Text>
              <Text style={[styles.tableCell, { width: '8%' }]}></Text>
              <Text style={[styles.tableCell, { width: '6%' }]}></Text>
              <Text style={[styles.tableCell, { width: '10%' }]}></Text>
              <Text style={[styles.tableCell, { width: '8%' }]}></Text>
              <Text style={[styles.tableCell, { width: '8%' }]}></Text>
              <Text style={[styles.tableCell, { width: '8%' }]}></Text>
              <Text style={[styles.tableCell, { width: '8%' }]}></Text>
              <Text style={[styles.tableCell, { width: '6%' }]}></Text>
              <Text style={[styles.tableCell, { width: '10%' }, styles.tableCellLast]}></Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerLine}>Remarks: {footerRemarks ? String(footerRemarks) : '-'}</Text>
          <Text style={styles.footerLine}>Done By: {doneBy || '-'}</Text>
          <Text style={styles.footerLine}>Approved By: {data.approvedBy || '-'}</Text>
          <Text style={styles.footerLine}>Printed By: {data.printedBy || '-'}</Text>
        </View>
      </Page>
    </Document>
  );
}
