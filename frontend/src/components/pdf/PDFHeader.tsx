import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  header: {
    marginBottom: 10,
    border: '1 solid #000',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottom: '1 solid #000',
    minHeight: 28,
  },
  leftBrand: {
    width: '24%',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'left',
    paddingHorizontal: 6,
  },
  centerWrap: {
    width: '52%',
    alignItems: 'center',
    justifyContent: 'center',
    borderLeft: '1 solid #000',
    borderRight: '1 solid #000',
    minHeight: 28,
  },
  reportTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  systemTitle: {
    fontSize: 8,
    textAlign: 'center',
    marginTop: 1,
  },
  rightBrand: {
    width: '24%',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'right',
    paddingHorizontal: 6,
  },
  metaBlock: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  metaRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  metaLabel: {
    width: 90,
    fontSize: 7.2,
    fontWeight: 'bold',
  },
  metaValue: {
    flex: 1,
    fontSize: 7.2,
  },
});

interface PDFHeaderProps {
  leftBrand?: string;
  rightBrand?: string;
  reportTitle?: string;
  systemTitle?: string;
  client?: string;
  manufacturedBy?: string;
}

export function PDFHeader({ 
  leftBrand = "Dr.Reddy's",
  rightBrand = 'Praj HiPurity Systems',
  reportTitle = 'LOG BOOK REPORT',
  systemTitle = 'DIGITAL LOG BOOK',
  client,
  manufacturedBy,
}: PDFHeaderProps) {
  const defaultClient =
    String(import.meta.env.VITE_AUDIT_REPORT_CLIENT || '').trim() ||
    'M/s. DR. REDDY\'S LABORATORIES LTD, FTO UNIT-09, VISAKHAPATNAM, AP';
  const defaultManufacturedBy =
    String(import.meta.env.VITE_AUDIT_REPORT_MANUFACTURED_BY || '').trim() ||
    'M/s. PRAJ HIPURITY SYSTEMS LIMITED';
  const clientLine = (client || defaultClient).trim();
  const manufacturedByLine = (manufacturedBy || defaultManufacturedBy).trim();

  return (
    <View style={styles.header}>
      <View style={styles.topRow}>
        <Text style={styles.leftBrand}>{leftBrand}</Text>
        <View style={styles.centerWrap}>
          <Text style={styles.reportTitle}>{reportTitle}</Text>
          <Text style={styles.systemTitle}>{systemTitle}</Text>
        </View>
        <Text style={styles.rightBrand}>{rightBrand}</Text>
      </View>
      <View style={styles.metaBlock}>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>CLIENT:-</Text>
          <Text style={styles.metaValue}>{clientLine}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>MANUFACTURED BY:-</Text>
          <Text style={styles.metaValue}>{manufacturedByLine}</Text>
        </View>
        <View style={[styles.metaRow, { marginBottom: 0 }]}>
          <Text style={styles.metaLabel}>SYSTEM TITLE :-</Text>
          <Text style={styles.metaValue}>{systemTitle}</Text>
        </View>
      </View>
    </View>
  );
}

