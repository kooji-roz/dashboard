const { createApp, ref, computed, onMounted, watch, nextTick } = Vue;

createApp({
    setup() {
        const TABLES = {
            internal: {
                id: '1odNcAdU-DEJ3_6045Th2dqWFmvjRNCgq8opfibDGC_o',
                name: 'Внутренние события',
                type: 'Внутреннее'
            },
            external: {
                id: '1wvUhRjVs5M_Ovms9Nq-a_C3AW8eh_KgpXjUwD6IGpmU',
                name: 'Внешние события',
                type: 'Внешнее'
            }
        };
        
        const PALETTE = {
            violet: '#B580D4',
            rose: '#DEAFDD',
            indigo: '#7586C9',
            pastel: '#E2D9DF',
            violetDark: '#6B4A8A',
            roseDark: '#8A4A87',
            indigoDark: '#5A6BB0',
            violetLight: '#E0C0EC',
            roseLight: '#EFC5EE',
            indigoLight: '#8B9AD6'
        };
        
        const loading = ref(false);
        const error = ref(null);
        const events = ref([]);
        const lastUpdate = ref('—');
        const stats = ref({ internal: 0, external: 0 });
        
        const currentWeekIndex = ref(0);
        const allWeeks = ref([]);
        const selectedDay = ref(null);
        
        const searchQuery = ref('');
        const typeFilter = ref('all');
        const monthFilter = ref('all');
        const page = ref(1);
        const perPage = 50;
        
        const isDark = ref(document.documentElement.classList.contains('dark'));

        const toggleTheme = () => {
            isDark.value = !isDark.value;
            if (isDark.value) {
                document.documentElement.classList.add('dark');
                localStorage.setItem('theme', 'dark');
            } else {
                document.documentElement.classList.remove('dark');
                localStorage.setItem('theme', 'light');
            }
            nextTick(() => renderCharts());
        };
        
        const typeChartRef = ref(null);
        const monthChartRef = ref(null);
        const venueChartRef = ref(null);
        const participantsChartRef = ref(null);
        
        let charts = { type: null, month: null, venue: null, participants: null };
        
        const weekDayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        const monthNamesGenitive = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
        
        const getMonday = (date) => {
            const d = new Date(date);
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            return new Date(d.setDate(diff));
        };
        
        const isSameDay = (d1, d2) => {
            return d1.getFullYear() === d2.getFullYear() &&
                   d1.getMonth() === d2.getMonth() &&
                   d1.getDate() === d2.getDate();
        };
        
        const formatDateFull = (date) => {
            if (!date) return '';
            const dayNames = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
            return `${date.getDate()} ${monthNamesGenitive[date.getMonth()]} ${date.getFullYear()}, ${dayNames[date.getDay()]}`;
        };
        
        const parseCSV = (text) => {
            try {
                const lines = text.split('\n').filter(l => l.trim());
                if (lines.length < 2) return [];
                const headers = parseCSVLine(lines[0]);
                return lines.slice(1).map(line => {
                    const values = parseCSVLine(line);
                    const obj = {};
                    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
                    return obj;
                }).filter(obj => Object.values(obj).some(v => v));
            } catch (e) {
                console.error('Ошибка парсинга CSV:', e);
                return [];
            }
        };
        
        const parseCSVLine = (line) => {
            const result = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
                    else { inQuotes = !inQuotes; }
                } else if (char === ',' && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                } else { current += char; }
            }
            result.push(current.trim());
            return result;
        };
        
        const findColumn = (row, keywords) => {
            for (const key of Object.keys(row)) {
                const keyLower = key.toLowerCase();
                for (const kw of keywords) {
                    if (keyLower.includes(kw.toLowerCase())) return row[key];
                }
            }
            return '';
        };
        
        const normalizeDate = (dateStr) => {
            if (!dateStr) return null;
            const str = String(dateStr).trim();
            let match;
            if (match = str.match(/(\d{1,2})[.-](\d{1,2})[.-](\d{4})/)) {
                return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
            }
            if (match = str.match(/(\d{4})-(\d{2})-(\d{2})/)) {
                return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
            }
            return null;
        };
        
        const parseDateRange = (dateStr) => {
            if (!dateStr) return null;
            const str = String(dateStr).trim();
            const rangeMatch = str.match(/(\d{1,2}[.-]\d{1,2}[.-]\d{4})\s*[-–—]\s*(\d{1,2}[.-]\d{1,2}[.-]\d{4})/);
            if (rangeMatch) {
                const start = normalizeDate(rangeMatch[1]);
                const end = normalizeDate(rangeMatch[2]);
                if (start && end) return { start, end };
            }
            const single = normalizeDate(str);
            if (single) return { start: single, end: single };
            return null;
        };
        
        const parseParticipants = (str) => {
            if (!str) return 0;
            const match = String(str).match(/\d+/);
            return match ? parseInt(match[0]) : 0;
        };
        
        const loadTable = async (tableKey) => {
            const table = TABLES[tableKey];
            const url = `https://docs.google.com/spreadsheets/d/${table.id}/export?format=csv`;
            
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status} для "${table.name}"`);
                const text = await response.text();
                const rawData = parseCSV(text);
                
                const result = [];
                rawData.forEach((row, index) => {
                    const rawDate = findColumn(row, ['дата']);
                    const dateRange = parseDateRange(rawDate);
                    if (!dateRange) return;
                    
                    const name = findColumn(row, ['название', 'наименование', 'мероприятие']);
                    if (!name) return;
                    
                    const venue = findColumn(row, ['площадка', 'место']);
                    const participants = parseParticipants(findColumn(row, ['участник', 'кол-во', 'количество']));
                    const organizer = findColumn(row, ['организатор']);
                    const responsible = findColumn(row, ['ответственный']);
                    const category = findColumn(row, ['категория', 'тип']);
                    const notes = findColumn(row, ['примечание', 'комментарий']);
                    const time = findColumn(row, ['время']);
                    
                    result.push({
                        id: `${tableKey}-${index}`,
                        dateStart: dateRange.start,
                        dateEnd: dateRange.end,
                        dateDisplay: rawDate.trim(),
                        name: name,
                        venue: venue,
                        participants: participants,
                        organizer: organizer,
                        responsible: responsible,
                        category: category,
                        notes: notes,
                        time: time,
                        type: table.type,
                        source: table.name
                    });
                });
                
                return result;
            } catch (err) {
                console.error(`Ошибка "${table.name}":`, err);
                throw err;
            }
        };
        
        const loadAllData = async () => {
            loading.value = true;
            error.value = null;
            
            try {
                const [internalData, externalData] = await Promise.all([
                    loadTable('internal'),
                    loadTable('external')
                ]);
                
                stats.value = {
                    internal: internalData.length,
                    external: externalData.length
                };
                
                events.value = [...internalData, ...externalData]
                    .sort((a, b) => a.dateStart - b.dateStart);
                
                generateWeeks();
                lastUpdate.value = new Date().toLocaleTimeString('ru-RU');
                
                await nextTick();
                renderCharts();
                
            } catch (err) {
                console.error('Общая ошибка:', err);
                error.value = err.message || 'Не удалось загрузить данные';
            } finally {
                loading.value = false;
            }
        };
        
        const generateWeeks = () => {
            if (events.value.length === 0) return;
            
            const minDate = new Date(Math.min(...events.value.map(e => e.dateStart)));
            const maxDate = new Date(Math.max(...events.value.map(e => e.dateEnd)));
            
            const firstMonday = getMonday(minDate);
            const lastSunday = new Date(getMonday(maxDate));
            lastSunday.setDate(lastSunday.getDate() + 6);
            
            const weeks = [];
            const current = new Date(firstMonday);
            let weekNum = 1;
            
            while (current <= lastSunday) {
                const weekStart = new Date(current);
                const weekEnd = new Date(current);
                weekEnd.setDate(weekEnd.getDate() + 6);
                
                weeks.push({ number: weekNum, start: weekStart, end: weekEnd });
                
                current.setDate(current.getDate() + 7);
                weekNum++;
            }
            
            allWeeks.value = weeks;
            
            const today = new Date();
            const todayMonday = getMonday(today);
            const currentIndex = weeks.findIndex(w => isSameDay(w.start, todayMonday));
            currentWeekIndex.value = currentIndex >= 0 ? currentIndex : Math.floor(weeks.length / 2);
        };
        
        const calendarDays = computed(() => {
            if (allWeeks.value.length === 0) return [];
            
            const week = allWeeks.value[currentWeekIndex.value];
            const today = new Date();
            const days = [];
            
            for (let i = 0; i < 7; i++) {
                const date = new Date(week.start);
                date.setDate(date.getDate() + i);
                
                const dayEvents = events.value.filter(event => {
                    return date >= event.dateStart && date <= event.dateEnd;
                });
                
                days.push({
                    dateObj: date,
                    dateNum: date.getDate(),
                    isCurrentMonth: date.getMonth() === week.start.getMonth(),
                    isToday: isSameDay(date, today),
                    events: dayEvents
                });
            }
            
            return days;
        });
        
        const weekRangeDisplay = computed(() => {
            if (allWeeks.value.length === 0) return '—';
            const week = allWeeks.value[currentWeekIndex.value];
            return `${week.start.getDate()} ${monthNamesGenitive[week.start.getMonth()]} — ${week.end.getDate()} ${monthNamesGenitive[week.end.getMonth()]} ${week.end.getFullYear()}`;
        });
        
        const currentWeekNumber = computed(() => {
            if (allWeeks.value.length === 0) return 0;
            return allWeeks.value[currentWeekIndex.value].number;
        });
        
        const totalWeeks = computed(() => allWeeks.value.length);
        
        const weekEvents = computed(() => {
            if (allWeeks.value.length === 0) return [];
            const week = allWeeks.value[currentWeekIndex.value];
            return events.value.filter(e => {
                return e.dateStart <= week.end && e.dateEnd >= week.start;
            });
        });
        
        const weekEventsCount = computed(() => weekEvents.value.length);
        const weekInternalCount = computed(() => weekEvents.value.filter(e => e.type === 'Внутреннее').length);
        const weekExternalCount = computed(() => weekEvents.value.filter(e => e.type === 'Внешнее').length);
        const weekParticipants = computed(() => weekEvents.value.reduce((s, e) => s + (e.participants || 0), 0));
        
        const filteredEvents = computed(() => {
            return events.value.filter(e => {
                if (typeFilter.value !== 'all' && e.type !== typeFilter.value) return false;
                if (monthFilter.value !== 'all') {
                    const month = String(e.dateStart.getMonth() + 1).padStart(2, '0');
                    if (month !== monthFilter.value) return false;
                }
                if (searchQuery.value) {
                    const q = searchQuery.value.toLowerCase();
                    return (e.name && e.name.toLowerCase().includes(q)) ||
                           (e.venue && e.venue.toLowerCase().includes(q)) ||
                           (e.organizer && e.organizer.toLowerCase().includes(q)) ||
                           (e.responsible && e.responsible.toLowerCase().includes(q));
                }
                return true;
            });
        });
        
        const totalPages = computed(() => Math.ceil(filteredEvents.value.length / perPage) || 1);
        const paginatedEvents = computed(() => {
            const start = (page.value - 1) * perPage;
            return filteredEvents.value.slice(start, start + perPage);
        });
        
        watch([searchQuery, typeFilter, monthFilter], () => { page.value = 1; });
        
        const previousWeek = () => { if (currentWeekIndex.value > 0) currentWeekIndex.value--; };
        const nextWeek = () => { if (currentWeekIndex.value < allWeeks.value.length - 1) currentWeekIndex.value++; };
        const goToCurrentWeek = () => {
            const today = new Date();
            const todayMonday = getMonday(today);
            const index = allWeeks.value.findIndex(w => isSameDay(w.start, todayMonday));
            if (index >= 0) currentWeekIndex.value = index;
        };
        const goToFirstWeek = () => { currentWeekIndex.value = 0; };
        const goToLastWeek = () => { currentWeekIndex.value = allWeeks.value.length - 1; };
        
        const openDayModal = (day) => {
            selectedDay.value = day;
            document.body.style.overflow = 'hidden';
        };
        
        const closeDayModal = () => {
            selectedDay.value = null;
            document.body.style.overflow = '';
        };
        
        const previousDay = () => {
            if (!selectedDay.value) return;
            const prev = new Date(selectedDay.value.dateObj);
            prev.setDate(prev.getDate() - 1);
            const weekStart = getMonday(prev);
            const weekIndex = allWeeks.value.findIndex(w => isSameDay(w.start, weekStart));
            if (weekIndex >= 0) {
                currentWeekIndex.value = weekIndex;
                nextTick(() => {
                    const day = calendarDays.value.find(d => isSameDay(d.dateObj, prev));
                    if (day) selectedDay.value = day;
                });
            }
        };
        
        const nextDay = () => {
            if (!selectedDay.value) return;
            const next = new Date(selectedDay.value.dateObj);
            next.setDate(next.getDate() + 1);
            const weekStart = getMonday(next);
            const weekIndex = allWeeks.value.findIndex(w => isSameDay(w.start, weekStart));
            if (weekIndex >= 0) {
                currentWeekIndex.value = weekIndex;
                nextTick(() => {
                    const day = calendarDays.value.find(d => isSameDay(d.dateObj, next));
                    if (day) selectedDay.value = day;
                });
            }
        };
        
        const handleKeydown = (e) => {
            if (e.key === 'Escape' && selectedDay.value) closeDayModal();
            if (e.key === 'ArrowLeft') { if (selectedDay.value) previousDay(); else previousWeek(); }
            if (e.key === 'ArrowRight') { if (selectedDay.value) nextDay(); else nextWeek(); }
        };
        
        const destroyAllCharts = () => {
            Object.keys(charts).forEach(key => {
                if (charts[key]) {
                    try { charts[key].destroy(); } catch (e) {}
                    charts[key] = null;
                }
            });
        };
        
        const renderCharts = () => {
            destroyAllCharts();
            
            if (!typeChartRef.value || !monthChartRef.value || !venueChartRef.value || !participantsChartRef.value) {
                return;
            }
        
            const darkMode = isDark.value;
            const textColor = darkMode ? '#cbd5e1' : '#475569';
            const gridColor = darkMode ? '#334155' : '#e2e8f0';
            
            // Общие responsive настройки для всех графиков
            const responsiveOptions = {
                responsive: [{
                    breakpoint: 768,
                    options: {
                        chart: { height: 260 },
                        legend: { position: 'bottom', fontSize: '11px' },
                        dataLabels: { style: { fontSize: '11px' } },
                        plotOptions: { bar: { columnWidth: '70%' } }
                    }
                }, {
                    breakpoint: 480,
                    options: {
                        chart: { height: 220 },
                        legend: { fontSize: '10px' },
                        dataLabels: { enabled: false },
                        plotOptions: { bar: { columnWidth: '80%' } }
                    }
                }]
            };
        
            try {
                // --- Donut chart ---
                charts.type = new ApexCharts(typeChartRef.value, {
                    chart: { 
                        type: 'donut', 
                        height: 320,
                        animations: { enabled: true }
                    },
                    series: [stats.value.internal, stats.value.external],
                    labels: ['Внутренние', 'Внешние'],
                    colors: [PALETTE.violet, PALETTE.rose],
                    theme: { mode: darkMode ? 'dark' : 'light' },
                    legend: { 
                        position: 'bottom', 
                        labels: { colors: textColor }, 
                        fontSize: '13px',
                        offsetX: 0,
                        offsetY: 5
                    },
                    plotOptions: { pie: { donut: { size: '65%' } } },
                    dataLabels: { enabled: true, style: { fontSize: '13px', colors: ['#fff'] } },
                    stroke: { colors: [darkMode ? '#1e293b' : '#ffffff'] },
                    tooltip: { theme: darkMode ? 'dark' : 'light' },
                    ...responsiveOptions
                });
                charts.type.render();
                
                // --- Month bar chart ---
                const monthData = { 'Апр': 0, 'Май': 0, 'Июн': 0, 'Июл': 0, 'Авг': 0 };
                const monthMap = { '04': 'Апр', '05': 'Май', '06': 'Июн', '07': 'Июл', '08': 'Авг' };
                events.value.forEach(e => {
                    const m = String(e.dateStart.getMonth() + 1).padStart(2, '0');
                    if (monthMap[m]) monthData[monthMap[m]]++;
                });
                
                charts.month = new ApexCharts(monthChartRef.value, {
                    chart: { type: 'bar', height: 320, toolbar: { show: false } },
                    series: [{ name: 'Мероприятий', data: Object.values(monthData) }],
                    xaxis: { 
                        categories: Object.keys(monthData), 
                        labels: { 
                            style: { colors: textColor },
                            rotate: 0,
                            rotateAlways: false
                        } 
                    },
                    yaxis: { labels: { style: { colors: textColor } } },
                    colors: [PALETTE.indigo],
                    theme: { mode: darkMode ? 'dark' : 'light' },
                    plotOptions: { bar: { borderRadius: 6, columnWidth: '60%' } },
                    dataLabels: { enabled: true, style: { colors: [darkMode ? '#fff' : '#333'] } },
                    grid: { borderColor: gridColor }, 
                    tooltip: { theme: darkMode ? 'dark' : 'light' },
                    ...responsiveOptions
                });
                charts.month.render();
                
                // --- Venue horizontal bar chart ---
                const venueData = {};
                events.value.forEach(e => {
                    if (e.venue && e.venue !== '—' && e.venue !== 'Вне кампуса') {
                        let v = e.venue.length > 35 ? e.venue.substring(0, 35) + '...' : e.venue;
                        venueData[v] = (venueData[v] || 0) + 1;
                    }
                });
                const sortedVenues = Object.entries(venueData).sort((a, b) => b[1] - a[1]).slice(0, 10);
                
                charts.venue = new ApexCharts(venueChartRef.value, {
                    chart: {
                        type: 'bar',
                        height: Math.max(320, sortedVenues.length * 40),
                        toolbar: { show: false },
                        animations: { enabled: true }
                    },
                    series: [{ name: 'Мероприятий', data: sortedVenues.map(v => v[1]) }],
                    xaxis: {
                        categories: sortedVenues.map(v => v[0]),
                        labels: {
                            style: { colors: textColor, fontSize: '11px' },
                            hideOverlappingLabels: true
                        }
                    },
                    yaxis: { 
                        labels: { 
                            style: { colors: textColor, fontSize: '11px' },
                            maxWidth: 140
                        } 
                    },
                    colors: [PALETTE.violet],
                    theme: { mode: darkMode ? 'dark' : 'light' },
                    plotOptions: {
                        bar: {
                            horizontal: true,
                            borderRadius: 4,
                            barHeight: '60%'
                        }
                    },
                    dataLabels: {
                        enabled: true,
                        style: { colors: [darkMode ? '#fff' : '#333'], fontSize: '11px' },
                        formatter: (val) => val
                    },
                    grid: {
                        borderColor: gridColor,
                        padding: { left: 10, right: 10, top: 0, bottom: 0 }
                    },
                    tooltip: { theme: darkMode ? 'dark' : 'light' },
                    responsive: [{
                        breakpoint: 768,
                        options: {
                            chart: { height: Math.max(260, sortedVenues.length * 35) },
                            yaxis: { labels: { maxWidth: 100, style: { fontSize: '10px' } } },
                            dataLabels: { enabled: false }
                        }
                    }, {
                        breakpoint: 480,
                        options: {
                            chart: { height: Math.max(220, sortedVenues.length * 30) },
                            yaxis: { labels: { maxWidth: 80, style: { fontSize: '9px' } } },
                            dataLabels: { enabled: false }
                        }
                    }]
                });
                charts.venue.render();
                
                // --- Participants area chart ---
                const partData = { 'Апр': 0, 'Май': 0, 'Июн': 0, 'Июл': 0, 'Авг': 0 };
                events.value.forEach(e => {
                    const m = String(e.dateStart.getMonth() + 1).padStart(2, '0');
                    if (monthMap[m]) partData[monthMap[m]] += (e.participants || 0);
                });
                
                charts.participants = new ApexCharts(participantsChartRef.value, {
                    chart: { type: 'area', height: 320, toolbar: { show: false } },
                    series: [{ name: 'Участников', data: Object.values(partData) }],
                    xaxis: { categories: Object.keys(partData), labels: { style: { colors: textColor } } },
                    yaxis: { labels: { style: { colors: textColor } } },
                    colors: [PALETTE.rose],
                    theme: { mode: darkMode ? 'dark' : 'light' },
                    stroke: { curve: 'smooth', width: 3 },
                    fill: { 
                        type: 'gradient', 
                        gradient: { 
                            shade: 'light',
                            opacityFrom: 0.6, 
                            opacityTo: 0.05 
                        } 
                    },
                    grid: { borderColor: gridColor },
                    tooltip: { theme: darkMode ? 'dark' : 'light' },
                    ...responsiveOptions
                });
                charts.participants.render();
                
            } catch (err) {
                console.error('Ошибка графиков:', err);
            }
        };
        
            // Debounce для resize
        let resizeTimer = null;
        const handleResize = () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (events.value.length > 0) {
                    renderCharts();
                }
            }, 250);
        };

        onMounted(() => {
            loadAllData();
            window.addEventListener('keydown', handleKeydown);
            window.addEventListener('resize', handleResize);
        });

        // Очистка при размонтировании (на всякий случай)
        // Если используете onUnmounted — добавьте:
        // onUnmounted(() => {
        //     window.removeEventListener('keydown', handleKeydown);
        //     window.removeEventListener('resize', handleResize);
        //     clearTimeout(resizeTimer);
        //     destroyAllCharts();
        // });
        return {
            loading, error, events, lastUpdate, stats,
            isDark, toggleTheme,
            weekDayNames,
            currentWeekIndex, allWeeks,
            currentWeekNumber, totalWeeks, weekRangeDisplay,
            calendarDays,
            weekEventsCount, weekInternalCount, weekExternalCount, weekParticipants,
            selectedDay,
            searchQuery, typeFilter, monthFilter, page, perPage,
            filteredEvents, paginatedEvents, totalPages,
            typeChartRef, monthChartRef, venueChartRef, participantsChartRef,
            loadAllData, previousWeek, nextWeek,
            goToCurrentWeek, goToFirstWeek, goToLastWeek,
            openDayModal, closeDayModal, previousDay, nextDay,
            formatDateFull
        };
    }
}).mount('#app');