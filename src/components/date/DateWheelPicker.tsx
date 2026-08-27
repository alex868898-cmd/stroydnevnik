import React, { useEffect, useMemo, useRef } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';

const ITEM_HEIGHT = 42;
const MONTHS = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];

interface WheelColumnProps {
  values: Array<string | number>;
  selectedIndex: number;
  onSelect: (index: number) => void;
  accessibilityLabel: string;
}

function WheelColumn({ values, selectedIndex, onSelect, accessibilityLabel }: WheelColumnProps) {
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      ref.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
    });
  }, [selectedIndex, values.length]);

  const selectOffset = (offset: number) => {
    const next = Math.max(0, Math.min(values.length - 1, selectedIndex + offset));
    onSelect(next);
    ref.current?.scrollTo({ y: next * ITEM_HEIGHT, animated: true });
  };

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.max(0, Math.min(values.length - 1, Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT)));
    onSelect(index);
  };

  return (
    <View style={styles.column} accessibilityLabel={accessibilityLabel}>
      <TouchableOpacity style={styles.arrowButton} onPress={() => selectOffset(-1)} accessibilityLabel="Попереднє значення">
        <Ionicons name="chevron-up" size={20} color={COLORS.textSecondary} />
      </TouchableOpacity>
      <View style={styles.wheelViewport}>
        <View pointerEvents="none" style={styles.selection} />
        <ScrollView
          ref={ref}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          nestedScrollEnabled
          contentContainerStyle={styles.wheelContent}
          onMomentumScrollEnd={handleScrollEnd}
          onScrollEndDrag={handleScrollEnd}
        >
          {values.map((value, index) => (
            <TouchableOpacity key={`${value}-${index}`} style={styles.item} onPress={() => onSelect(index)}>
              <Text style={[styles.itemText, index === selectedIndex && styles.itemTextSelected]}>{value}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <TouchableOpacity style={styles.arrowButton} onPress={() => selectOffset(1)} accessibilityLabel="Наступне значення">
        <Ionicons name="chevron-down" size={20} color={COLORS.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

interface DateWheelPickerProps {
  value: Date;
  onChange: (value: Date) => void;
}

export function DateWheelPicker({ value, onChange }: DateWheelPickerProps) {
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: 16 }, (_, index) => currentYear - 14 + index), [currentYear]);
  const daysInMonth = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, index) => index + 1), [daysInMonth]);

  const setDatePart = (year: number, month: number, day: number) => {
    const maxDay = new Date(year, month + 1, 0).getDate();
    onChange(new Date(year, month, Math.min(day, maxDay), 12));
  };

  return (
    <View style={styles.container}>
      <WheelColumn
        values={days}
        selectedIndex={value.getDate() - 1}
        onSelect={index => setDatePart(value.getFullYear(), value.getMonth(), index + 1)}
        accessibilityLabel="День"
      />
      <WheelColumn
        values={MONTHS}
        selectedIndex={value.getMonth()}
        onSelect={index => setDatePart(value.getFullYear(), index, value.getDate())}
        accessibilityLabel="Місяць"
      />
      <WheelColumn
        values={years}
        selectedIndex={Math.max(0, years.indexOf(value.getFullYear()))}
        onSelect={index => setDatePart(years[index], value.getMonth(), value.getDate())}
        accessibilityLabel="Рік"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: 190,
    gap: 8,
  },
  column: {
    flex: 1,
    alignItems: 'center',
  },
  arrowButton: {
    width: '100%',
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelViewport: {
    width: '100%',
    height: 126,
    overflow: 'hidden',
  },
  wheelContent: {
    paddingVertical: ITEM_HEIGHT,
  },
  selection: {
    position: 'absolute',
    top: ITEM_HEIGHT,
    left: 2,
    right: 2,
    height: ITEM_HEIGHT,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '18',
    zIndex: 1,
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    color: COLORS.textMuted,
    fontSize: 16,
  },
  itemTextSelected: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
  },
});
