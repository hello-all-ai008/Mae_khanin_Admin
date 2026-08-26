import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X, Filter, ArrowUpDown, GripVertical, Search, Pin, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '../lib/utils';
import './AdvancedTable.css';

const AdvancedTable = ({ columns: rawColumns = [], data, groupBy = null, pageSize: initialPageSize = 50, externalCurrentPage = null, onPageChange = null, className = "", maxHeight = 'calc(100vh - 280px)' }) => {
    // Normalize columns
    const initialColumns = useMemo(() => (rawColumns || []).map((col, idx) => ({
        ...col,
        key: col.key || col.accessor || col.id || `col_${idx}`,
        label: col.label ?? col.header ?? col.name ?? col.key ?? ''
    })), [rawColumns]);

    // State
    const [sortConfig, setSortConfig] = useState(null); // { key, direction }
    const [filters, setFilters] = useState({}); // { key: [selectedValues] }
    const [likeFilters, setLikeFilters] = useState({}); // { key: 'substring' }
    const [likeFilterTypes, setLikeFilterTypes] = useState({}); // { key: 'contains' | 'startsWith' | 'endsWith' }
    const [filterOpen, setFilterOpen] = useState(null); // Key of column with open filter menu
    const [internalPage, setInternalPage] = useState(1);
    const [pageSize] = useState(initialPageSize);

    // --- Column Order & Resize State ---
    const [columnOrder, setColumnOrder] = useState(() => initialColumns.map((_, i) => i));
    const [columnWidths, setColumnWidths] = useState(() =>
        initialColumns.reduce((acc, col) => ({ ...acc, [col.key]: col.defaultWidth || 140 }), {})
    );
    const [frozenColumns, setFrozenColumns] = useState([]);

    // --- Column Search State ---
    const [columnSearchKeyword, setColumnSearchKeyword] = useState('');
    const [highlightedColumn, setHighlightedColumn] = useState(null);
    const [searchMatchIndex, setSearchMatchIndex] = useState(0);
    const scrollContainerRef = useRef(null);
    const thRefs = useRef({});

    // Sync columnOrder and columnWidths when initialColumns or data changes
    useEffect(() => {
        setColumnOrder(initialColumns.map((_, i) => i));
        
        const charWidth = 8; // Approximate px per character
        const paddingAndIcons = 90; // Padding + sort icon + filter icon
        
        const newWidths = initialColumns.reduce((acc, col) => {
            let maxLen = String(col.label || '').length;
            
            if (data && data.length > 0) {
                // Check sample size (first 100 rows) to avoid lag on huge datasets
                const sampleData = data.slice(0, 100);
                sampleData.forEach(row => {
                    const contentStr = typeof row[col.key] === 'object' && row[col.key] !== null 
                        ? JSON.stringify(row[col.key]) 
                        : String(row[col.key] || '');
                    if (contentStr.length > maxLen) {
                        maxLen = contentStr.length;
                    }
                });
            }
            
            // Limit width between 130px and 600px
            const calcWidth = Math.min(Math.max(maxLen * charWidth + paddingAndIcons, 130), 600);
            acc[col.key] = col.defaultWidth ? Math.max(col.defaultWidth, calcWidth) : calcWidth;
            return acc;
        }, {});
        
        setColumnWidths(newWidths);
    }, [initialColumns.length, initialColumns.map(c => c.key).join('|'), data]);

    // Drag-to-Reorder refs
    const dragSourceIndex = useRef(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);

    // Drag-to-Resize refs
    const resizingKey = useRef(null);
    const resizeStartX = useRef(0);
    const resizeStartWidth = useRef(0);

    // Derive ordered columns — guard against stale indices
    const columns = useMemo(() => {
        let baseCols = initialColumns;
        if (columnOrder.length === initialColumns.length) {
            baseCols = columnOrder.map(i => initialColumns[i]).filter(Boolean);
        }
        
        const frozen = baseCols.filter(c => frozenColumns.includes(c.key));
        const unfrozen = baseCols.filter(c => !frozenColumns.includes(c.key));
        
        return [...frozen, ...unfrozen];
    }, [columnOrder, initialColumns, frozenColumns]);

    // Use external page if provided, otherwise use internal state
    const currentPage = externalCurrentPage !== null ? externalCurrentPage : internalPage;

    const handlePageChange = (newPage) => {
        if (onPageChange) {
            onPageChange(newPage);
        } else {
            setInternalPage(newPage);
        }
    };

    // =========================================================
    // Column Search Handler
    // =========================================================
    const executeColumnSearch = () => {
        if (!columnSearchKeyword) {
            setSearchMatchIndex(0);
            return;
        }
        const lower = columnSearchKeyword.toLowerCase();
        const foundCols = columns.filter(c => (c.label || c.key).toLowerCase().includes(lower));
        
        if (foundCols.length > 0) {
            const colToFocus = foundCols[searchMatchIndex % foundCols.length];
            setHighlightedColumn(colToFocus.key);
            
            const thEl = thRefs.current[colToFocus.key];
            if (thEl && scrollContainerRef.current) {
                const container = scrollContainerRef.current;
                const scrollLeft = thEl.offsetLeft - container.offsetWidth / 2 + thEl.offsetWidth / 2;
                container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
            }
            
            setSearchMatchIndex(prev => prev + 1);
            setTimeout(() => setHighlightedColumn(null), 3000);
        }
    };

    // =========================================================
    // Export Excel (.xlsx) Handler
    // =========================================================
    const handleExportExcel = () => {
        if (!processedData || processedData.length === 0) return;

        // Map data to match columns
        const exportData = processedData.map(row => {
            const rowData = {};
            columns.forEach(c => {
                let val = row[c.key];
                if (val === null || val === undefined) val = '';
                else if (typeof val === 'object') val = JSON.stringify(val);
                rowData[c.label || c.key] = val;
            });
            return rowData;
        });

        // Create a new workbook and worksheet
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Report Data");

        // Generate Excel file and trigger download
        XLSX.writeFile(workbook, "export_data.xlsx");
    };

    // =========================================================
    // Column Drag-to-Reorder Handlers
    // =========================================================
    const handleDragStart = (e, visualIndex) => {
        dragSourceIndex.current = visualIndex;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(visualIndex));
        // Ghost image: use the th element
        e.currentTarget.style.opacity = '0.5';
    };

    const handleDragEnd = (e) => {
        e.currentTarget.style.opacity = '1';
        setDragOverIndex(null);
        dragSourceIndex.current = null;
    };

    const handleDragOver = (e, visualIndex) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragSourceIndex.current !== null && dragSourceIndex.current !== visualIndex) {
            setDragOverIndex(visualIndex);
        }
    };

    const handleDrop = (e, visualIndex) => {
        e.preventDefault();
        const from = dragSourceIndex.current;
        if (from === null || from === visualIndex) return;

        setColumnOrder(prev => {
            const next = [...prev];
            const [removed] = next.splice(from, 1);
            next.splice(visualIndex, 0, removed);
            return next;
        });
        setDragOverIndex(null);
        dragSourceIndex.current = null;
    };

    // =========================================================
    // Column Resize Handlers
    // =========================================================
    const handleResizeMouseDown = useCallback((e, colKey) => {
        e.preventDefault();
        e.stopPropagation();
        resizingKey.current = colKey;
        resizeStartX.current = e.clientX;
        resizeStartWidth.current = columnWidths[colKey] || 140;

        const onMouseMove = (ev) => {
            if (!resizingKey.current) return;
            const delta = ev.clientX - resizeStartX.current;
            const newWidth = Math.max(60, resizeStartWidth.current + delta);
            setColumnWidths(prev => ({ ...prev, [resizingKey.current]: newWidth }));
        };

        const onMouseUp = () => {
            resizingKey.current = null;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }, [columnWidths]);

    // --- Filter Logic ---

    // Get unique values for each column to build filter options
    const getUniqueValues = (key) => {
        const unique = new Set(data.map(item => item[key]));
        return Array.from(unique).sort();
    };

    // Toggle filter selection
    const toggleFilter = (key, value) => {
        setFilters(prev => {
            const current = prev[key] || [];
            const updated = current.includes(value)
                ? current.filter(v => v !== value)
                : [...current, value];

            // If empty, remove the key entirely
            if (updated.length === 0) {
                const { [key]: _, ...rest } = prev;
                return rest;
            }
            return { ...prev, [key]: updated };
        });
        setCurrentPage(1); // Reset to page 1 on filter change
    };

    const setCurrentPage = (page) => {
        handlePageChange(page);
    };

    const clearFilter = (key) => {
        setFilters(prev => {
            const { [key]: _, ...rest } = prev;
            return rest;
        });
        setLikeFilters(prev => {
            const { [key]: _, ...rest } = prev;
            return rest;
        });
        setLikeFilterTypes(prev => {
            const { [key]: _, ...rest } = prev;
            return rest;
        });
        setCurrentPage(1);
    };

    const handleLikeFilterChange = (key, value) => {
        setLikeFilters(prev => {
            if (!value) {
                const { [key]: _, ...rest } = prev;
                return rest;
            }
            return { ...prev, [key]: value };
        });
        setCurrentPage(1);
    };

    const handleLikeFilterTypeChange = (key, type) => {
        setLikeFilterTypes(prev => ({ ...prev, [key]: type }));
        setCurrentPage(1);
    };

    // --- Sort Logic ---
    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        } else if (sortConfig && sortConfig.key === key && sortConfig.direction === 'descending') {
            setSortConfig(null); // Toggle off (Clear sort)
            return;
        }
        setSortConfig({ key, direction });
    };

    // --- Memoized Data Processor ---
    const processedData = useMemo(() => {
        let filtered = [...data];

        // 1. Filtering (Exact Match Checkboxes)
        Object.keys(filters).forEach(key => {
            if (filters[key].length > 0) {
                filtered = filtered.filter(item => filters[key].includes(item[key]));
            }
        });

        // 1.5 Filtering (LIKE / Substring Search)
        Object.keys(likeFilters).forEach(key => {
            const searchVal = likeFilters[key];
            const searchType = likeFilterTypes[key] || 'contains';
            if (searchVal) {
                filtered = filtered.filter(item => {
                    const itemVal = String(item[key] || '').toLowerCase();
                    const target = searchVal.toLowerCase();
                    if (searchType === 'startsWith') return itemVal.startsWith(target);
                    if (searchType === 'endsWith') return itemVal.endsWith(target);
                    return itemVal.includes(target);
                });
            }
        });

        // 2. Sorting
        if (sortConfig) {
            filtered.sort((a, b) => {
                if (a[sortConfig.key] < b[sortConfig.key]) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (a[sortConfig.key] > b[sortConfig.key]) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }

        return filtered;
    }, [data, filters, sortConfig]);

    // --- Pagination Logic ---
    const totalPages = Math.ceil(processedData.length / pageSize);
    const paginatedData = processedData.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );

    // --- Summation Logic ---
    const totals = columns.reduce((acc, col) => {
        if (col.isNumeric) {
            acc[col.key] = processedData.reduce((sum, item) => sum + (Number(item[col.key]) || 0), 0);
        }
        return acc;
    }, {});


    // Calculate cumulative left offsets for frozen columns
    let currentLeft = 0;
    const stickyStyles = {};
    columns.forEach(col => {
        if (frozenColumns.includes(col.key)) {
            stickyStyles[col.key] = {
                position: 'sticky',
                left: currentLeft,
                zIndex: 20,
            };
            currentLeft += columnWidths[col.key] || 140;
        }
    });
    const lastFrozenKey = frozenColumns.length > 0 ? frozenColumns[frozenColumns.length - 1] : null;

    const totalColumnsWidth = columns.reduce((sum, col) => sum + (columnWidths[col.key] || 140), 0);

    return (
        <div className={cn("flex flex-col relative w-full", className)} style={{ height: maxHeight, background: 'var(--bg)', minWidth: 0, maxWidth: '100%', overflow: 'hidden', borderRadius: '10px', border: '1px solid var(--line)' }}>

            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '14px', color: 'var(--ink-2)' }}>
                        <b style={{ color: 'var(--ink)' }}>{processedData.length}</b> records
                    </span>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                            <Search size={14} className="text-slate-400" />
                        </div>
                        <input 
                            type="text" 
                            placeholder="ค้นหาชื่อ Column..." 
                            value={columnSearchKeyword}
                            onChange={e => {
                                setColumnSearchKeyword(e.target.value);
                                setSearchMatchIndex(0);
                                if (!e.target.value) setHighlightedColumn(null);
                            }}
                            onKeyDown={e => {
                                if (e.key === 'Enter') executeColumnSearch();
                            }}
                            className="search"
                            style={{ paddingLeft: '32px', width: '200px', margin: 0, fontSize: '13px' }}
                        />
                    </div>
                </div>
                <div>
                    <button 
                        onClick={handleExportExcel}
                        className="btn btn-sm"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <Download size={14} />
                        Export Excel
                    </button>
                </div>
            </div>

            {/* Scrollable Table Wrapper */}
            <div ref={scrollContainerRef} className="overflow-x-auto flex-1 min-h-0 custom-scrollbar" style={{ overflowY: 'auto', width: '100%', maxWidth: '100%' }}>
                <table
                    className="text-left border-collapse text-slate-800 h-full"
                    style={{ minWidth: `${Math.max(totalColumnsWidth, 500)}px`, tableLayout: 'fixed', width: '100%' }}
                >
                    <colgroup>
                        {columns.map(col => (
                            <col key={col.key} style={{ width: `${columnWidths[col.key] || 140}px` }} />
                        ))}
                    </colgroup>

                    <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                        <tr style={{ background: 'var(--bg-soft)' }}>
                            {columns.map((col, visualIndex) => (
                                <th
                                    key={col.key}
                                    ref={el => thRefs.current[col.key] = el}
                                    className={cn(
                                        "p-0 relative group select-none transition-colors duration-300",
                                        col.align === 'center' ? "text-center" : col.align === 'right' ? "text-right" : "text-left"
                                    )}
                                    style={{ 
                                        width: `${columnWidths[col.key] || 140}px`, 
                                        position: stickyStyles[col.key] ? 'sticky' : 'relative',
                                        left: stickyStyles[col.key]?.left,
                                        top: stickyStyles[col.key] ? 0 : undefined,
                                        zIndex: stickyStyles[col.key] ? 30 : undefined,
                                        overflow: 'visible'
                                    }}
                                    draggable={!frozenColumns.includes(col.key)}
                                    onDragStart={e => handleDragStart(e, visualIndex)}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={e => handleDragOver(e, visualIndex)}
                                    onDrop={e => handleDrop(e, visualIndex)}
                                >
                                    {/* Column header content */}
                                    <div className={cn(
                                        "flex items-center gap-1 px-3 py-3 whitespace-nowrap",
                                        col.align === 'center' ? "justify-center" : col.align === 'right' ? "justify-end" : ""
                                    )}>
                                        {/* Drag Handle Icon */}
                                        <span
                                            className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing flex-shrink-0 transition-colors"
                                            title="Drag to reorder"
                                        >
                                            <GripVertical size={13} />
                                        </span>

                                        {/* Sort trigger */}
                                        <span
                                            onClick={() => requestSort(col.key)}
                                            className="cursor-pointer hover:text-slate-800 transition-colors flex items-center gap-1 min-w-0 flex-1 overflow-hidden"
                                        >
                                            <span 
                                                className="truncate select-text"
                                                onDoubleClick={(e) => {
                                                    e.stopPropagation();
                                                    const selection = window.getSelection();
                                                    const range = document.createRange();
                                                    range.selectNodeContents(e.currentTarget);
                                                    selection.removeAllRanges();
                                                    selection.addRange(range);
                                                }}
                                            >
                                                {col.label}
                                            </span>
                                            {sortConfig && col.key && sortConfig.key === col.key ? (
                                                sortConfig?.direction === 'ascending'
                                                    ? <ArrowUp size={14} className="text-slate-600 flex-shrink-0" />
                                                    : <ArrowDown size={14} className="text-slate-600 flex-shrink-0" />
                                            ) : (
                                                <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-50 flex-shrink-0" />
                                            )}
                                        </span>

                                        {/* Pin Trigger */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setFrozenColumns(prev => 
                                                    prev.includes(col.key) ? prev.filter(k => k !== col.key) : [...prev, col.key]
                                                );
                                            }}
                                            className={cn(
                                                "btn-icon th-hover-icon",
                                                frozenColumns.includes(col.key) && "active"
                                            )}
                                            style={{ 
                                                width: '24px', height: '24px', border: 'none', padding: 0,
                                                color: frozenColumns.includes(col.key) ? 'var(--ink)' : 'var(--ink-2)'
                                            }}
                                        >
                                            <Pin size={13} fill={frozenColumns.includes(col.key) ? "currentColor" : "none"} />
                                        </button>

                                        {/* Filter Trigger */}
                                        <div className="relative flex-shrink-0">
                                            <button
                                                onClick={() => {
                                                    const isOpen = filterOpen === col.key;
                                                    setFilterOpen(isOpen ? null : col.key);
                                                }}
                                                className={cn(
                                                    "btn-icon th-hover-icon",
                                                    (filterOpen === col.key || filters[col.key] || likeFilters[col.key]) && "active"
                                                )}
                                                style={{
                                                    width: '24px', height: '24px', border: 'none', padding: 0,
                                                    color: (filters[col.key] || likeFilters[col.key]) ? 'var(--ink)' : 'var(--ink-2)'
                                                }}
                                            >
                                                <Filter size={13} fill={(filters[col.key] || likeFilters[col.key]) ? "currentColor" : "none"} />
                                            </button>

                                            {/* Filter Dropdown */}
                                            {filterOpen === col.key && (
                                                <>
                                                    <div
                                                        className="fixed inset-0 z-40"
                                                        onClick={() => setFilterOpen(null)}
                                                    />
                                                    <div className={cn(
                                                        "card absolute top-full mt-2 w-64 z-50 animate-fade-in",
                                                        columns.indexOf(col) > columns.length - 2 ? "right-0" : "left-0"
                                                    )} style={{ padding: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                                        <div className="flex justify-between items-center mb-3">
                                                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filter {col.label}</span>
                                                            {(filters[col.key] || likeFilters[col.key]) && (
                                                                <button
                                                                    onClick={() => clearFilter(col.key)}
                                                                    style={{ fontSize: '11px', color: 'var(--warn)', background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, cursor: 'pointer' }}
                                                                >
                                                                    Clear <X size={12} />
                                                                </button>
                                                            )}
                                                        </div>

                                                        <div className="mb-3 space-y-2">
                                                            <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                                                                {['startsWith', 'contains', 'endsWith'].map(type => (
                                                                    <button
                                                                        key={type}
                                                                        onClick={() => handleLikeFilterTypeChange(col.key, type)}
                                                                        className="btn btn-sm"
                                                                        style={Object.assign({ padding: '4px 8px', fontSize: '10px', flex: 1, textTransform: 'uppercase' },
                                                                            (likeFilterTypes[col.key] || 'contains') === type
                                                                                ? { background: 'var(--ink)', color: '#fff', borderColor: 'var(--ink)' }
                                                                                : { background: 'transparent', color: 'var(--ink-2)', borderColor: 'var(--line)' }
                                                                        )}
                                                                    >
                                                                        {type === 'startsWith' ? 'Start' : type === 'endsWith' ? 'End' : 'Any'}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                            <input
                                                                type="text"
                                                                placeholder={
                                                                    (likeFilterTypes[col.key] || 'contains') === 'startsWith' ? `Starts with "value"...` :
                                                                        (likeFilterTypes[col.key] || 'contains') === 'endsWith' ? `Ends with "value"...` :
                                                                            `Contains "value"...`
                                                                }
                                                                value={likeFilters[col.key] || ''}
                                                                onChange={(e) => handleLikeFilterChange(col.key, e.target.value)}
                                                                className="search"
                                                                style={{ width: '100%', padding: '8px 12px' }}
                                                                autoFocus
                                                            />
                                                        </div>

                                                        <div className="custom-scrollbar" style={{ maxHeight: '200px', overflowY: 'auto', paddingTop: '8px', marginTop: '8px', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            {getUniqueValues(col.key)
                                                                .filter(val => {
                                                                    const searchVal = likeFilters[col.key];
                                                                    if (!searchVal) return true;
                                                                    const itemVal = String(val || '').toLowerCase();
                                                                    const target = searchVal.toLowerCase();
                                                                    const searchType = likeFilterTypes[col.key] || 'contains';
                                                                    if (searchType === 'startsWith') return itemVal.startsWith(target);
                                                                    if (searchType === 'endsWith') return itemVal.endsWith(target);
                                                                    return itemVal.includes(target);
                                                                })
                                                                .map(val => (
                                                                    <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--ink)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-soft)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={filters[col.key]?.includes(val) || false}
                                                                            onChange={() => toggleFilter(col.key, val)}
                                                                            style={{ width: '16px', height: '16px', accentColor: 'var(--ink)' }}
                                                                        />
                                                                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{val == null ? <em style={{ color: 'var(--ink-2)' }}>(Empty)</em> : val}</span>
                                                                    </label>
                                                                ))}
                                                            {getUniqueValues(col.key).filter(val => {
                                                                const searchVal = likeFilters[col.key];
                                                                if (!searchVal) return true;
                                                                const itemVal = String(val || '').toLowerCase();
                                                                const target = searchVal.toLowerCase();
                                                                const searchType = likeFilterTypes[col.key] || 'contains';
                                                                if (searchType === 'startsWith') return itemVal.startsWith(target);
                                                                if (searchType === 'endsWith') return itemVal.endsWith(target);
                                                                return itemVal.includes(target);
                                                            }).length === 0 && (
                                                                    <div style={{ fontSize: '12px', color: 'var(--ink-2)', textAlign: 'center', padding: '16px 0' }}>No matches found</div>
                                                                )}
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* ── Resize Handle ── */}
                                    <div
                                        onMouseDown={e => handleResizeMouseDown(e, col.key)}
                                        className="absolute top-0 right-0 h-full w-2 cursor-col-resize z-20 flex items-center justify-center group/resize"
                                        title="Drag to resize column"
                                        style={{ touchAction: 'none' }}
                                    >
                                        <div className="w-0.5 h-5 bg-slate-300 rounded-full opacity-0 group-hover/resize:opacity-100 group-hover:opacity-60 transition-opacity" />
                                    </div>

                                    {/* Drop indicator line on left edge when dragging over */}
                                    {dragOverIndex === visualIndex && (
                                        <div className="absolute left-0 top-0 h-full w-0.5 bg-indigo-500 z-30 pointer-events-none" />
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {paginatedData.length > 0 ? (
                            paginatedData.map((row, index) => (
                                <tr key={index} style={{ transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-soft)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    {columns.map(col => (
                                        <td
                                            key={col.key}
                                            className={cn(
                                                col.isNumeric && "mono"
                                            )}
                                            style={{
                                                width: `${columnWidths[col.key] || 140}px`,
                                                maxWidth: `${columnWidths[col.key] || 140}px`,
                                                overflow: 'hidden',
                                                position: stickyStyles[col.key] ? 'sticky' : undefined,
                                                left: stickyStyles[col.key]?.left,
                                                zIndex: stickyStyles[col.key] ? 20 : undefined,
                                                background: frozenColumns.includes(col.key) ? 'var(--bg)' : undefined,
                                                textAlign: col.align || 'left'
                                            }}
                                        >
                                            {col.render
                                                ? col.render(row[col.key], row)
                                                : (typeof row[col.key] === 'object' && row[col.key] !== null
                                                    ? JSON.stringify(row[col.key])
                                                    : row[col.key])
                                            }
                                        </td>
                                    ))}
                                </tr>
                            ))

                        ) : (
                            <tr>
                                <td colSpan={columns.length} className="p-8 text-center text-slate-500">
                                    No results found matching your filters.
                                </td>
                            </tr>
                        )}
                        {/* Spacer to push tfoot down */}
                        <tr style={{ height: '100%' }}>
                            <td colSpan={columns.length} className="border-none p-0"></td>
                        </tr>
                    </tbody>

                    {/* Summation Footer */}
                    <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 10, background: 'var(--bg-soft)', borderTop: '2px solid var(--line)' }}>
                        <tr>
                            {columns.map(col => (
                                <td
                                    key={col.key}
                                    className={cn(
                                        "px-3 py-3 text-sm font-bold text-slate-800",
                                        col.align === 'center' ? "text-center" : col.align === 'right' ? "text-right" : "text-left",
                                        frozenColumns.includes(col.key) && "bg-slate-50"
                                    )}
                                    style={{
                                        position: stickyStyles[col.key] ? 'sticky' : undefined,
                                        left: stickyStyles[col.key]?.left,
                                        bottom: stickyStyles[col.key] ? 0 : undefined,
                                        zIndex: stickyStyles[col.key] ? 20 : undefined
                                    }}
                                >
                                    {col.isNumeric ? (
                                        <div className={cn("flex flex-col", col.align === 'center' ? "items-center" : col.align === 'right' ? "items-end" : "")}>
                                            <span className="text-[10px] uppercase text-slate-500 tracking-wide">Total</span>
                                            {totals[col.key].toLocaleString()}
                                        </div>
                                    ) : (
                                        (col.primary || (!columns.some(c => c.primary) && columns.indexOf(col) === 0)) && (
                                            <span className="text-xs text-slate-500 font-normal">Total {processedData.length} records</span>
                                        )
                                    )}
                                </td>
                            ))}
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* Pagination Controls */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderTop: '1px solid var(--line)', background: 'var(--bg)' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>
                        Page {currentPage} of {totalPages === 0 ? 1 : totalPages}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--ink-2)' }}>
                        Showing {processedData.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, processedData.length)} of {processedData.length} records
                    </span>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => handlePageChange(1)}
                        disabled={currentPage === 1}
                        className="btn-icon"
                        style={{ width: '32px', height: '32px', borderRadius: '8px', padding: 0 }}
                        title="Previous Page"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        // Simple pagination logic to show limited pages
                        let p = i + 1;
                        if (totalPages > 5 && currentPage > 3) {
                            p = currentPage - 2 + i;
                            // Adjust if we are near the end
                            if (p > totalPages - 4) {
                                p = totalPages - 4 + i;
                            }
                        }
                        if (p > totalPages || p < 1) return null;

                        return (
                            <button
                                key={p}
                                onClick={() => handlePageChange(p)}
                                className="btn-icon"
                                style={{ 
                                    width: '32px', height: '32px', borderRadius: '8px', padding: 0, 
                                    background: currentPage === p ? 'var(--ink)' : 'var(--bg)', 
                                    color: currentPage === p ? '#fff' : 'var(--ink)' 
                                }}
                            >
                                {p}
                            </button>
                        );
                    })}
                    <button
                        onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="btn-icon"
                        style={{ width: '32px', height: '32px', borderRadius: '8px', padding: 0 }}
                        title="Last Page"
                    >
                        <ChevronsRight size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AdvancedTable;
