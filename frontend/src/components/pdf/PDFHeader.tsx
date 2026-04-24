import React from 'react';
import { View, Text, StyleSheet, Image } from '@react-pdf/renderer';
import { loadOrganizationSettings } from '@/lib/organizationSettings';

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
  logoLeft?: string;
}

export function PDFHeader({
  leftBrand = '',
  rightBrand = "Dr. Reddy's",
  reportTitle = 'LOG BOOK REPORT',
  systemTitle = 'DIGITAL LOG BOOK',
  client,
  manufacturedBy,
  logoLeft,
}: PDFHeaderProps) {
  const org = loadOrganizationSettings();

  const effectiveLogoLeft = String(logoLeft || org.logoDataUrl || '').trim();
  const clientLine = (client || `${org.organizationName}${org.address ? `, ${org.address}` : ''}` || '—').trim();
  const manufacturedByLine = (manufacturedBy || org.industry || '—').trim();
  const leftBrandText = String(leftBrand || '').trim();

  return (
    <View style={styles.header}>
      <View style={styles.topRow}>
        <View style={styles.leftBrand}>
          {effectiveLogoLeft ? (
            <Image src={effectiveLogoLeft} style={{ height: 22, width: 110, objectFit: 'contain' as any }} />
          ) : (
            <Text style={{ fontSize: 9 }}>{leftBrandText}</Text>
          )}
        </View>
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

