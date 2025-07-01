// Grid Layout System for Dashboard
class GridLayout {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.items = [];
        this.dragItem = null;
        this.dragStartPosition = { x: 0, y: 0 };
        this.isDragging = false;
        this.isResizing = false;
        this.resizeItem = null;
        this.resizeStartSize = { width: 0, height: 0 };
        this.resizeStartPosition = { x: 0, y: 0 };
        this.layoutConfig = this.loadLayoutConfig() || {};
        this.editMode = false;
        this.lastSwapTime = null;
        this.gridSize = { cols: 6, rows: 0 }; // Кількість колонок у сітці
        
        this.init();
    }
    
    init() {
        // Initialize grid items
        this.items = Array.from(this.container.querySelectorAll('.grid-item'));
        
        // Apply saved positions and sizes
        this.applyLayoutConfig();
        
        // Add event listeners
        this.setupDragAndDrop();
        this.setupResize();
        
        // Add visual indicators for edit mode
        this.setupEditModeIndicators();
        
        // Save layout on window resize (debounced)
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.updateGridSize();
                this.saveLayoutConfig();
                this.reinitializeGrid(); // Ensure proper layout after resize
            }, 500);
        });
        
        // Add double-click handler for resize handle to reset card height
        this.setupDoubleClickReset();
        
        // Call once to ensure proper initial layout
        this.updateGridSize();
        this.reinitializeGrid();
    }
    
    // Визначає кількість колонок у сітці залежно від ширини екрана
    updateGridSize() {
        const containerWidth = this.container.clientWidth;
        if (containerWidth > 1024) {
            this.gridSize.cols = 6;
        } else if (containerWidth > 600) {
            this.gridSize.cols = 4;
        } else {
            this.gridSize.cols = 2;
        }
    }
    
    setupEditModeIndicators() {
        // Add edit mode instructions that appear when edit mode is active
        const instructionsEl = document.createElement('div');
        instructionsEl.className = 'edit-mode-instructions';
        instructionsEl.innerHTML = `
            <div class="instructions-content">
                <p>Перетягніть картку в будь-яке місце, щоб змінити її розташування</p>
                <p>Використовуйте маркер у правому нижньому куті, щоб змінити розмір</p>
                <p>Подвійний клік на маркер скидає висоту картки до стандартної</p>
            </div>
        `;
        instructionsEl.style.display = 'none';
        
        // Add to body
        document.body.appendChild(instructionsEl);
        
        // Show/hide based on edit mode
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (this.container.classList.contains('edit-mode')) {
                        instructionsEl.style.display = 'block';
                    } else {
                        instructionsEl.style.display = 'none';
                    }
                }
            });
        });
        
        observer.observe(this.container, { attributes: true });
    }
    
    setupDragAndDrop() {
        // Setup drag events for each item - now the entire card is draggable
        this.items.forEach(item => {
            item.addEventListener('mousedown', (e) => {
                // Ignore if clicking on a button or resize handle
                if (e.target.tagName === 'BUTTON' || e.target.closest('.resize-handle')) {
                    return;
                }
                this.onDragStart(e, item);
            });
            
            item.addEventListener('touchstart', (e) => {
                // Ignore if touching a button or resize handle
                if (e.target.tagName === 'BUTTON' || e.target.closest('.resize-handle')) {
                    return;
                }
                this.onDragStart(e, item);
            }, { passive: false });
        });
        
        // Global mouse/touch events
        document.addEventListener('mousemove', (e) => this.onDragMove(e));
        document.addEventListener('touchmove', (e) => this.onDragMove(e), { passive: false });
        document.addEventListener('mouseup', (e) => this.onDragEnd(e));
        document.addEventListener('touchend', (e) => this.onDragEnd(e));
    }
    
    setupResize() {
        // Setup resize events for each item
        this.items.forEach(item => {
            const resizeHandle = item.querySelector('.resize-handle');
            
            if (resizeHandle) {
                resizeHandle.addEventListener('mousedown', (e) => this.onResizeStart(e, item));
                resizeHandle.addEventListener('touchstart', (e) => this.onResizeStart(e, item), { passive: false });
            }
        });
        
        // Global mouse/touch events for resize
        document.addEventListener('mousemove', (e) => this.onResizeMove(e));
        document.addEventListener('touchmove', (e) => this.onResizeMove(e), { passive: false });
        document.addEventListener('mouseup', (e) => this.onResizeEnd(e));
        document.addEventListener('touchend', (e) => this.onResizeEnd(e));
    }
    
    onDragStart(e, item) {
        if (this.isResizing || !this.editMode) return;
        
        e.preventDefault();
        
        // Get pointer position
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        // Get item's current position and size
        const rect = item.getBoundingClientRect();
        
        this.isDragging = true;
        this.dragItem = item;
        
        // Store initial position - use offset from cursor to card corner
        this.dragStartPosition = {
            x: clientX,
            y: clientY,
            offsetX: clientX - rect.left,
            offsetY: clientY - rect.top
        };
        
        // Set the item's position to absolute to keep it with the cursor
        item.style.position = 'absolute';
        item.style.width = `${rect.width}px`;
        item.style.height = `${rect.height}px`;
        item.style.zIndex = '1000';
        
        // Position it exactly where it is currently to avoid jumps
        item.style.top = `${rect.top}px`;
        item.style.left = `${rect.left}px`;
        
        // Add dragging class
        item.classList.add('dragging');
        
        // Create placeholder
        this.createPlaceholder(item);
    }
    
    onDragMove(e) {
        if (!this.isDragging || !this.dragItem) return;
        
        e.preventDefault();
        
        // Get pointer position
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        // Calculate actual page position (accounting for scroll)
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;
        
        // Set direct position rather than using transform for more stable dragging
        // Adjust position by the initial offset to keep cursor on the same spot on the card
        const left = clientX - this.dragStartPosition.offsetX;
        const top = clientY - this.dragStartPosition.offsetY;
        
        // Use requestAnimationFrame for smoother updates
        requestAnimationFrame(() => {
            this.dragItem.style.left = `${left}px`;
            this.dragItem.style.top = `${top}px`;
        });
        
        // Find closest grid cell based on cursor position
        const containerRect = this.container.getBoundingClientRect();
        const relativeX = clientX - containerRect.left;
        const relativeY = clientY - containerRect.top;
        
        // Знаходимо найближчу комірку сітки
        this.moveItemToClosestCell(relativeX, relativeY);
    }
    
    // Рухаємо картку до найближчої комірки сітки
    moveItemToClosestCell(x, y) {
        if (!this.dragItem || !this.isDragging) return;
        
        const containerRect = this.container.getBoundingClientRect();
        const cellWidth = containerRect.width / this.gridSize.cols;
        const cellHeight = 190; // Приблизна висота комірки з урахуванням відступів
        
        // Визначаємо розмір картки в комірках сітки
        let colSpan = 2; // За замовчуванням, маленька картка (size-1x1) займає 2 колонки
        if (this.dragItem.classList.contains('size-2x1') || this.dragItem.classList.contains('size-2x2')) {
            colSpan = 4; // Велика картка займає 4 колонки
        }
        
        // Визначаємо найближчу комірку для лівого верхнього кута картки
        const cellX = Math.max(0, Math.floor(x / cellWidth));
        const cellY = Math.max(0, Math.floor(y / cellHeight));
        
        // Знаходимо всі картки, щоб перевірити, чи є вільне місце
        const items = Array.from(this.container.querySelectorAll('.grid-item:not(.dragging)'));
        const placeholder = this.container.querySelector('.grid-item-placeholder');
        
        // Видаляємо поточний placeholder
        if (placeholder) {
            this.container.removeChild(placeholder);
        }
        
        // Створюємо новий placeholder в потрібній позиції
        const newPlaceholder = document.createElement('div');
        newPlaceholder.className = 'grid-item-placeholder';
        
        // Встановлюємо розмір placeholder відповідно до розміру картки
        if (this.dragItem.classList.contains('size-1x1')) {
            newPlaceholder.style.gridColumn = `${cellX + 1} / span 2`;
            newPlaceholder.style.gridRow = `${cellY + 1} / span 1`;
        } else if (this.dragItem.classList.contains('size-1x2')) {
            newPlaceholder.style.gridColumn = `${cellX + 1} / span 2`;
            newPlaceholder.style.gridRow = `${cellY + 1} / span 2`;
        } else if (this.dragItem.classList.contains('size-2x1')) {
            newPlaceholder.style.gridColumn = `${cellX + 1} / span 4`;
            newPlaceholder.style.gridRow = `${cellY + 1} / span 1`;
        } else if (this.dragItem.classList.contains('size-2x2')) {
            newPlaceholder.style.gridColumn = `${cellX + 1} / span 4`;
            newPlaceholder.style.gridRow = `${cellY + 1} / span 2`;
        }
        
        // Додаємо placeholder до контейнера
        this.container.appendChild(newPlaceholder);
    }
    
    onDragEnd(e) {
        if (!this.isDragging) return;
        
        // Reset dragging state
        this.isDragging = false;
        
        if (this.dragItem) {
            // Get the placeholder
            const placeholder = this.container.querySelector('.grid-item-placeholder');
            
            if (placeholder) {
                // Get grid position from placeholder
                const gridColumnStart = placeholder.style.gridColumn.split(' ')[0];
                const gridRowStart = placeholder.style.gridRow.split(' ')[0];
                
                // Apply grid position to the dragged item
                this.dragItem.style.gridColumn = placeholder.style.gridColumn;
                this.dragItem.style.gridRow = placeholder.style.gridRow;
                
                // Reset the item's position to static and clear inline styles
                this.dragItem.style.position = '';
                this.dragItem.style.top = '';
                this.dragItem.style.left = '';
                this.dragItem.style.width = '';
                this.dragItem.style.height = '';
                this.dragItem.style.zIndex = '';
                
                // Remove the placeholder
                this.container.removeChild(placeholder);
            }
            
            // Remove dragging class
            this.dragItem.classList.remove('dragging');
            
            // Save the new layout
            this.saveLayoutConfig();
        }
    }
    
    onResizeStart(e, item) {
        if (this.isDragging || !this.editMode) return;
        
        e.preventDefault();
        
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        this.isResizing = true;
        this.resizeItem = item;
        
        // Get content element for height adjustment
        this.resizeContent = item.querySelector('.card-content');
        
        // Store initial size and position
        const rect = item.getBoundingClientRect();
        const contentRect = this.resizeContent ? this.resizeContent.getBoundingClientRect() : rect;
        
        this.resizeStartSize = {
            width: rect.width,
            height: contentRect.height
        };
        
        this.resizeStartPosition = {
            x: clientX,
            y: clientY
        };
        
        // Add resizing class
        item.classList.add('resizing');
    }
    
    onResizeMove(e) {
        if (!this.isResizing || !this.resizeItem || !this.resizeContent) return;
        
        e.preventDefault();
        
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        // Calculate new dimensions
        const deltaY = clientY - this.resizeStartPosition.y;
        const newHeight = Math.max(50, this.resizeStartSize.height + deltaY); // Minimum height
        
        // Apply new height to the content element
        this.resizeContent.style.height = `${newHeight}px`;
        
        // Mark as custom height
        this.resizeItem.classList.add('custom-height');
    }
    
    onResizeEnd(e) {
        if (!this.isResizing) return;
        
        this.isResizing = false;
        
        if (this.resizeItem) {
            // Remove resizing class
            this.resizeItem.classList.remove('resizing');
            
            // Save the new layout
            this.saveLayoutConfig();
            
            // Clean up
            this.resizeItem = null;
            this.resizeContent = null;
        }
    }
    
    createPlaceholder(item) {
        const placeholder = document.createElement('div');
        placeholder.className = 'grid-item-placeholder';
        
        // Match the size of the original item
        if (item.classList.contains('size-1x1')) {
            placeholder.style.gridColumn = 'span 2';
            placeholder.style.gridRow = 'span 1';
        } else if (item.classList.contains('size-1x2')) {
            placeholder.style.gridColumn = 'span 2';
            placeholder.style.gridRow = 'span 2';
        } else if (item.classList.contains('size-2x1')) {
            placeholder.style.gridColumn = 'span 4';
            placeholder.style.gridRow = 'span 1';
        } else if (item.classList.contains('size-2x2')) {
            placeholder.style.gridColumn = 'span 4';
            placeholder.style.gridRow = 'span 2';
        }
        
        // Insert placeholder at the same position
        this.container.insertBefore(placeholder, item);
    }
    
    saveLayoutConfig() {
        // Create a fresh config object
        const config = {};
        
        // Save position and size for each item
        this.items.forEach(item => {
            const id = item.id;
            if (!id) return;
            
            // Get grid position
            const computedStyle = window.getComputedStyle(item);
            const gridColumn = item.style.gridColumn || computedStyle.gridColumn;
            const gridRow = item.style.gridRow || computedStyle.gridRow;
            
            // Determine the current size class
            let size = '1x1'; // Default size
            if (item.classList.contains('size-2x1')) size = '2x1';
            if (item.classList.contains('size-2x2')) size = '2x2';
            if (item.classList.contains('size-1x2')) size = '1x2';
            
            // Save item's current state
            config[id] = {
                size: size,
                gridColumn: gridColumn,
                gridRow: gridRow
            };
            
            // Save custom height if present
            const contentElement = item.querySelector('.card-content');
            if (contentElement && contentElement.style.height) {
                config[id].height = parseInt(contentElement.style.height);
            }
        });
        
        // Save to localStorage
        localStorage.setItem('gridLayoutConfig', JSON.stringify(config));
        
        return config;
    }
    
    loadLayoutConfig() {
        const savedConfig = localStorage.getItem('gridLayoutConfig');
        return savedConfig ? JSON.parse(savedConfig) : null;
    }
    
    applyLayoutConfig() {
        if (!this.layoutConfig || Object.keys(this.layoutConfig).length === 0) {
            console.log("No saved layout config found");
            return;
        }
        
        // Apply config to each item
        this.items.forEach(item => {
            const id = item.id;
            if (!id || !this.layoutConfig[id]) return;
            
            // Apply size class
            const size = this.layoutConfig[id].size || '1x1';
            item.classList.remove('size-1x1', 'size-1x2', 'size-2x1', 'size-2x2');
            item.classList.add(`size-${size}`);
            
            // Apply grid position if saved
            if (this.layoutConfig[id].gridColumn) {
                item.style.gridColumn = this.layoutConfig[id].gridColumn;
            }
            
            if (this.layoutConfig[id].gridRow) {
                item.style.gridRow = this.layoutConfig[id].gridRow;
            }
            
            // Apply custom height if set
            if (this.layoutConfig[id].height) {
                const contentElement = item.querySelector('.card-content');
                if (contentElement) {
                    // Set the stored height directly to this specific card's content
                    contentElement.style.height = `${this.layoutConfig[id].height}px`;
                    // Mark this card as having custom height
                    item.classList.add('custom-height');
                }
            }
        });
        
        // Force a layout refresh
        this.refreshLayout();
    }
    
    setupDoubleClickReset() {
        // Add double-click event to resize handles to reset card height
        this.items.forEach(item => {
            const resizeHandle = item.querySelector('.resize-handle');
            if (resizeHandle) {
                resizeHandle.addEventListener('dblclick', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    if (!this.editMode) return;
                    
                    // Reset this card's height
                    const contentElement = item.querySelector('.card-content');
                    if (contentElement) {
                        contentElement.style.height = '';
                        item.classList.remove('custom-height');
                        
                        // Refresh layout after resetting height
                        this.refreshLayout();
                        
                        // Show reset indicator
                        const indicator = document.createElement('div');
                        indicator.className = 'reset-indicator';
                        indicator.textContent = 'Висота скинута';
                        indicator.style.position = 'absolute';
                        indicator.style.top = '5px';
                        indicator.style.right = '5px';
                        indicator.style.background = 'rgba(46, 204, 113, 0.8)';
                        indicator.style.color = 'white';
                        indicator.style.padding = '3px 6px';
                        indicator.style.borderRadius = '4px';
                        indicator.style.fontSize = '10px';
                        indicator.style.zIndex = '100';
                        item.appendChild(indicator);
                        
                        // Remove indicator after 2 seconds
                        setTimeout(() => {
                            if (item.contains(indicator)) {
                                item.removeChild(indicator);
                            }
                        }, 2000);
                        
                        // Save updated layout
                        this.saveLayoutConfig();
                    }
                });
            }
        });
    }
    
    refreshLayout() {
        // Toggle a class to force reflow of the grid
        this.container.classList.add('refresh-grid');
        setTimeout(() => {
            this.container.classList.remove('refresh-grid');
        }, 100);
    }
    
    reinitializeGrid() {
        // Update grid size based on window width
        this.updateGridSize();
        
        // Get all current items
        this.items = Array.from(this.container.querySelectorAll('.grid-item'));
        
        // Clear any temporary styles
        this.items.forEach(item => {
            if (!this.layoutConfig || !this.layoutConfig[item.id]) {
                // Reset any styles that might interfere with layout
                item.style.position = '';
                item.style.top = '';
                item.style.left = '';
                item.style.transform = '';
            }
        });
        
        // Force a layout recalculation
        this.refreshLayout();
    }
}

// Reset layout function - can be called from console or added as a button
function resetDashboardLayout() {
    localStorage.removeItem('gridLayoutConfig');
    window.location.reload();
}

// Initialize grid layout when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const gridLayout = new GridLayout('dashboard-grid');
    
    // Add edit mode toggle and reset buttons to the dashboard
    const homeTab = document.getElementById('home');
    if (homeTab) {
        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'dashboard-controls';
        
        // Edit mode button
        const editButton = document.createElement('button');
        editButton.textContent = 'Редагувати розташування';
        editButton.className = 'edit-layout-btn';
        editButton.onclick = () => {
            gridLayout.editMode = !gridLayout.editMode;
            
            // Update button text and class
            if (gridLayout.editMode) {
                editButton.textContent = 'Завершити редагування';
                editButton.classList.add('active');
                document.getElementById('dashboard-grid').classList.add('edit-mode');
            } else {
                // Save layout when exiting edit mode
                gridLayout.saveLayoutConfig();
                
                editButton.textContent = 'Редагувати розташування';
                editButton.classList.remove('active');
                document.getElementById('dashboard-grid').classList.remove('edit-mode');
            }
        };
        
        // Reset button
        const resetButton = document.createElement('button');
        resetButton.textContent = 'Скинути розташування';
        resetButton.className = 'reset-layout-btn';
        resetButton.onclick = resetDashboardLayout;
        
        // Add buttons to container
        buttonContainer.appendChild(editButton);
        buttonContainer.appendChild(resetButton);
        
        // Add container to the body instead of home tab to ensure it stays fixed regardless of scrolling
        document.body.appendChild(buttonContainer);
        
        // Add event listener to hide the buttons when not on the home tab
        document.querySelectorAll('.sidebar button').forEach(btn => {
            btn.addEventListener('click', function() {
                const tabId = this.getAttribute('onclick').match(/'([^']+)'/)[1];
                if (tabId === 'home') {
                    buttonContainer.style.display = 'flex';
                } else {
                    buttonContainer.style.display = 'none';
                }
            });
        });
        
        // Ensure buttons are visible initially if home tab is active
        if (document.getElementById('home').classList.contains('active')) {
            buttonContainer.style.display = 'flex';
        } else {
            buttonContainer.style.display = 'none';
        }
    }
}); 