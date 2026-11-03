import React, { useMemo } from 'react';
import { FixedSizeList } from 'react-window';

export default function VirtualList({ items = [], renderItem, height = 520, itemSize = 80, itemKey, className = '', threshold = 100 }) {
  const rows = useMemo(() => items.map((item, index) => ({ item, index })), [items]);
  if (items.length <= threshold) return <div className={className} role="list">{rows.map(({ item, index }) => <div role="listitem" key={itemKey?.(item, index) ?? item?.id ?? index}>{renderItem(item, index)}</div>)}</div>;
  const Row = ({ index, style, data }) => {
    const { item, itemIndex } = data[index];
    return <div role="listitem" style={style} key={itemKey?.(item, itemIndex) ?? item?.id ?? itemIndex}>{renderItem(item, itemIndex)}</div>;
  };
  return <FixedSizeList className={`virtual-list ${className}`} height={height} itemCount={rows.length} itemSize={itemSize} itemData={rows} itemKey={index => itemKey?.(rows[index].item, rows[index].index) ?? rows[index].item?.id ?? index} width="100%" overscanCount={5}>{Row}</FixedSizeList>;
}
