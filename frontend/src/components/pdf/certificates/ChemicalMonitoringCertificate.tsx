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
});

interface ChemicalMonitoringData {
  approvedBy?: string;
  printedBy?: string;
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
  const footerRemarks =
    data.logs.find((log) => (log.remarks || '').toString().trim().length > 0)?.remarks || '';
  const doneBy = data.logs[0]?.checkedBy ?? '';
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PDFHeader />
        
        <Text style={styles.title}>RAW DATA FOR CHEMICAL MONITORING</Text>

        <View style={styles.table}>
          {/* Header Row */}
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, { width: '10%' }]}>Date</Text>
            <Text style={[styles.tableCell, { width: '10%' }]}>Time</Text>
            <Text style={[styles.tableCell, { width: '12%' }]}>EqP Name</Text>
            <Text style={[styles.tableCell, { width: '12%' }]}>Chemical name</Text>
            <Text style={[styles.tableCell, { width: '10%' }]}>Chemical %</Text>
            <Text style={[styles.tableCell, { width: '12%' }]}>Solution concentration %</Text>
            <Text style={[styles.tableCell, { width: '10%' }]}>Water Qty</Text>
            <Text style={[styles.tableCell, { width: '10%' }]}>Chemical Qty</Text>
            <Text style={[styles.tableCell, { width: '7%' }]}>Remarks</Text>
            <Text style={[styles.tableCell, { width: '7%' }, styles.tableCellLast]}>Done By</Text>
          </View>

          {/* Data Rows */}
          {data.logs.map((log, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: '10%' }]}>{log.date === 'Automatic' || !log.date ? 'Automatic' : log.date}</Text>
              <Text style={[styles.tableCell, { width: '10%' }]}>{log.time === 'Automatic' || !log.time ? 'Automatic' : log.time}</Text>
              <Text style={[styles.tableCell, styles.tableCellLeft, { width: '12%' }]}>
                {log.equipmentName || ''}
              </Text>
              <Text style={[styles.tableCell, { width: '12%' }]}>
                {log.chemicalName || ''}
              </Text>
              <Text style={[styles.tableCell, { width: '10%' }]}>
                {log.chemicalPercent !== undefined ? `${log.chemicalPercent}% - Automatic` : ''}
              </Text>
              <Text style={[styles.tableCell, { width: '12%' }]}>
                {log.solutionConcentration !== undefined ? `${log.solutionConcentration} %` : ''}
              </Text>
              <Text style={[styles.tableCell, { width: '10%' }]}>
                {log.waterQty !== undefined ? `${log.waterQty} L` : ''}
              </Text>
              <Text style={[styles.tableCell, { width: '10%' }]}>
                {log.chemicalQty !== undefined ? `${log.chemicalQty} G` : ''}
              </Text>
              <Text style={[styles.tableCell, { width: '7%' }]}>
                {log.remarks || '-'}
              </Text>
              <Text style={[styles.tableCell, { width: '7%' }, styles.tableCellLast]}>
                {log.checkedBy || ''}
              </Text>
            </View>
          ))}

          {/* Empty rows for additional entries */}
          {Array.from({ length: Math.max(0, 10 - data.logs.length) }).map((_, index) => (
            <View key={`empty-${index}`} style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: '10%' }]}></Text>
              <Text style={[styles.tableCell, { width: '10%' }]}></Text>
              <Text style={[styles.tableCell, { width: '12%' }]}></Text>
              <Text style={[styles.tableCell, { width: '12%' }]}></Text>
              <Text style={[styles.tableCell, { width: '10%' }]}></Text>
              <Text style={[styles.tableCell, { width: '12%' }]}></Text>
              <Text style={[styles.tableCell, { width: '10%' }]}></Text>
              <Text style={[styles.tableCell, { width: '10%' }]}></Text>
              <Text style={[styles.tableCell, { width: '7%' }]}></Text>
              <Text style={[styles.tableCell, { width: '7%' }, styles.tableCellLast]}></Text>
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

      {/* DETAILS */}
      <Page size="A4" style={styles.page}>
        <PDFHeader />
        <Text style={styles.detailsTitle}>RAW DATA FOR CHEMICAL MONITORING (DETAILS)</Text>

        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>Date</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>Time</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '14%' }]}>Batch No</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '12%' }]}>Done By</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '14%' }]}>Operator</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '14%' }]}>Approved At</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '14%' }]}>Secondary Approved</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '12%' }, styles.tableCellLast]}>Comment</Text>
          </View>

          {data.logs.map((log, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>{log.date || ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>{log.time || ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '14%' }]}>{log.batchNo || ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '12%' }]}>{log.doneBy || ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '14%' }]}>{log.operatorName || ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '14%' }]}>{log.approvedAt || ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '14%' }]}>{log.secondaryApprovedAt || ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '12%' }, styles.tableCellLast]}>{log.comment || ''}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

