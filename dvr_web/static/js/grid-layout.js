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
                this.saveLayoutConfig();
            }, 500);
        });
    }
    
    setupEditModeIndicators() {
        // Add edit mode instructions that appear when edit mode is active
        const instructionsEl = document.createElement('div');
        instructionsEl.className = 'edit-mode-instructions';
        instructionsEl.innerHTML = `
            <div class="instructions-content">
                <p>Перетягніть картку в будь-яке місце, щоб змінити її розташування</p>
                <p>Використовуйте маркер у правому нижньому куті, щоб змінити розмір (ширину та висоту)</p>
            </div>
        `;
        instructionsEl.style.display = 'none';
        
        // Add to container
        this.container.parentNode.insertBefore(instructionsEl, this.container);
        
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
        
        this.isDragging = true;
        this.dragItem = item;
        
        // Store initial position
        this.dragStartPosition = {
            x: clientX,
            y: clientY
        };
        
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
        
        // Calculate new position
        const deltaX = clientX - this.dragStartPosition.x;
        const deltaY = clientY - this.dragStartPosition.y;
        
        // Move the dragged item
        this.dragItem.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        
        // Find the item under the cursor
        const elemBelow = this.getElementBelow(clientX, clientY);
        
        if (elemBelow && elemBelow !== this.dragItem && elemBelow.classList.contains('grid-item')) {
            this.swapItems(this.dragItem, elemBelow);
        }
    }
    
    onDragEnd(e) {
        if (!this.isDragging) return;
        
        // Reset dragging state
        this.isDragging = false;
        
        if (this.dragItem) {
            // Remove dragging class and reset transform
            this.dragItem.classList.remove('dragging');
            this.dragItem.style.transform = '';
            
            // Remove placeholder
            this.removePlaceholder();
            
            // Save the new layout
            this.saveLayoutConfig();
            
            this.dragItem = null;
        }
    }
    
    onResizeStart(e, item) {
        if (!this.editMode) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        // Get pointer position
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        this.isResizing = true;
        this.resizeItem = item;
        
        // Store initial size
        const rect = item.getBoundingClientRect();
        this.resizeStartSize = {
            width: rect.width,
            height: rect.height
        };
        
        // Store initial position
        this.resizeStartPosition = {
            x: clientX,
            y: clientY
        };
        
        // Add resizing class
        item.classList.add('resizing');
    }
    
    onResizeMove(e) {
        if (!this.isResizing || !this.resizeItem) return;
        
        e.preventDefault();
        
        // Get pointer position
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        // Calculate new size
        const deltaX = clientX - this.resizeStartPosition.x;
        const deltaY = clientY - this.resizeStartPosition.y;
        
        const newWidth = this.resizeStartSize.width + deltaX;
        const newHeight = this.resizeStartSize.height + deltaY;
        
        // Apply direct height to the item's content for more precise control
        const minHeight = 100; // Мінімальна висота в пікселях
        if (newHeight >= minHeight) {
            const contentElement = this.resizeItem.querySelector('.card-content');
            if (contentElement) {
                contentElement.style.height = `${newHeight - 80}px`; // Віднімаємо висоту заголовка і відступів
            }
        }
        
        // Update width classes based on new dimensions
        this.updateWidthClass(this.resizeItem, newWidth);
    }
    
    onResizeEnd(e) {
        if (!this.isResizing) return;
        
        // Reset resizing state
        this.isResizing = false;
        
        if (this.resizeItem) {
            // Remove resizing class
            this.resizeItem.classList.remove('resizing');
            
            // Save the new layout
            this.saveLayoutConfig();
            
            this.resizeItem = null;
        }
    }
    
    updateWidthClass(item, width) {
        // Remove existing width classes
        item.classList.remove('size-1x1', 'size-1x2', 'size-2x1', 'size-2x2');
        
        // Calculate columns based on width
        const cellWidth = 300; // Base cell width
        const cols = Math.max(1, Math.min(2, Math.round(width / cellWidth)));
        
        // Get current height class (1 or 2)
        let heightClass = 1;
        if (item.classList.contains('size-1x2') || item.classList.contains('size-2x2')) {
            heightClass = 2;
        }
        
        // Add appropriate size class for width only
        item.classList.add(`size-${cols}x${heightClass}`);
    }
    
    getElementBelow(x, y) {
        // Hide dragged element temporarily to find element below
        if (this.dragItem) {
            this.dragItem.style.display = 'none';
        }
        
        // Get element at position
        const elemBelow = document.elementFromPoint(x, y);
        
        // Restore dragged element
        if (this.dragItem) {
            this.dragItem.style.display = '';
        }
        
        // Find closest grid-item parent
        let gridItem = elemBelow;
        while (gridItem && !gridItem.classList.contains('grid-item')) {
            gridItem = gridItem.parentElement;
        }
        
        return gridItem;
    }
    
    swapItems(item1, item2) {
        // Get the items' positions in the DOM
        const items = Array.from(this.container.children);
        const index1 = items.indexOf(item1);
        const index2 = items.indexOf(item2);
        
        // Swap the items in the DOM
        if (index1 >= 0 && index2 >= 0) {
            if (index1 < index2) {
                this.container.insertBefore(item2, item1);
            } else {
                this.container.insertBefore(item1, item2);
            }
        }
    }
    
    createPlaceholder(item) {
        const placeholder = document.createElement('div');
        placeholder.className = 'grid-item grid-item-placeholder';
        
        // Copy size classes
        if (item.classList.contains('size-1x1')) placeholder.classList.add('size-1x1');
        if (item.classList.contains('size-1x2')) placeholder.classList.add('size-1x2');
        if (item.classList.contains('size-2x1')) placeholder.classList.add('size-2x1');
        if (item.classList.contains('size-2x2')) placeholder.classList.add('size-2x2');
        
        // Insert placeholder at the same position
        this.container.insertBefore(placeholder, item);
    }
    
    removePlaceholder() {
        const placeholder = this.container.querySelector('.grid-item-placeholder');
        if (placeholder) {
            this.container.removeChild(placeholder);
        }
    }
    
    saveLayoutConfig() {
        const config = {};
        
        // Save each item's position and size
        this.items.forEach(item => {
            const id = item.id;
            if (!id) return;
            
            let size = '1x1';
            if (item.classList.contains('size-1x2')) size = '1x2';
            if (item.classList.contains('size-2x1')) size = '2x1';
            if (item.classList.contains('size-2x2')) size = '2x2';
            
            // Get position in grid
            const items = Array.from(this.container.children);
            const index = items.indexOf(item);
            
            // Get custom height if set
            let height = null;
            const contentElement = item.querySelector('.card-content');
            if (contentElement && contentElement.style.height) {
                height = parseInt(contentElement.style.height);
            }
            
            config[id] = {
                size: size,
                position: index,
                height: height
            };
        });
        
        // Save to localStorage
        localStorage.setItem('gridLayoutConfig', JSON.stringify(config));
        this.layoutConfig = config;
    }
    
    loadLayoutConfig() {
        const configStr = localStorage.getItem('gridLayoutConfig');
        return configStr ? JSON.parse(configStr) : null;
    }
    
    applyLayoutConfig() {
        if (!this.layoutConfig) return;
        
        // Sort items by saved position
        const sortedItems = [...this.items].sort((a, b) => {
            const posA = this.layoutConfig[a.id]?.position || 0;
            const posB = this.layoutConfig[b.id]?.position || 0;
            return posA - posB;
        });
        
        // Apply positions and sizes
        sortedItems.forEach(item => {
            const id = item.id;
            if (!id || !this.layoutConfig[id]) return;
            
            // Apply size
            const size = this.layoutConfig[id].size || '1x1';
            item.classList.remove('size-1x1', 'size-1x2', 'size-2x1', 'size-2x2');
            item.classList.add(`size-${size}`);
            
            // Apply custom height if set
            if (this.layoutConfig[id].height) {
                const contentElement = item.querySelector('.card-content');
                if (contentElement) {
                    contentElement.style.height = `${this.layoutConfig[id].height}px`;
                }
            }
            
            // Move to correct position
            this.container.appendChild(item);
        });
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
        buttonContainer.style.position = 'absolute';
        buttonContainer.style.top = '10px';
        buttonContainer.style.right = '10px';
        buttonContainer.style.zIndex = '100';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '10px';
        
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
        
        // Add container to home tab
        homeTab.appendChild(buttonContainer);
    }
}); 