// components/SearchBar.js
export default function SearchBar({ value, onChange, className }) {
  return (
    <div className={className}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="搜索文章 / 数据集关键词..."
      />
    </div>
  );
}
