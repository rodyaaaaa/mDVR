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
                this.reinitializeGrid(); // Ensure proper layout after resize
            }, 500);
        });
        
        // Add double-click handler for resize handle to reset card height
        this.setupDoubleClickReset();
        
        // Call once to ensure proper initial layout
        this.reinitializeGrid();
    }
    
    setupEditModeIndicators() {
        // Add edit mode instructions that appear when edit mode is active
        const instructionsEl = document.createElement('div');
        instructionsEl.className = 'edit-mode-instructions';
        instructionsEl.innerHTML = `
            <div class="instructions-content">
                <p>Перетягніть картку в будь-яке місце, щоб змінити її розташування</p>
                <p>Використовуйте маркер у правому нижньому куті, щоб змінити розмір (ширину та висоту)</p>
                <p>Подвійний клік на маркер скидає висоту картки до стандартної</p>
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
        
        // Find the item under the cursor for swapping - but throttle this check
        // to avoid excessive DOM operations
        if (!this.lastSwapTime || Date.now() - this.lastSwapTime > 100) {
            this.lastSwapTime = Date.now();
            
            const elemBelow = this.getElementBelow(clientX, clientY);
        
        if (elemBelow && elemBelow !== this.dragItem && elemBelow.classList.contains('grid-item')) {
            this.swapItems(this.dragItem, elemBelow);
            }
        }
    }
    
    onDragEnd(e) {
        if (!this.isDragging) return;
        
        // Reset dragging state
        this.isDragging = false;
        
        if (this.dragItem) {
            // Get the placeholder
            const placeholder = this.container.querySelector('.grid-item-placeholder');
            
            // Move the dragged item to the placeholder's position before removing the placeholder
            if (placeholder) {
                // Insert the dragged item where the placeholder is
                this.container.insertBefore(this.dragItem, placeholder);
                
                // Now remove the placeholder
                this.container.removeChild(placeholder);
            } else {
                // If no placeholder found, still keep the item in the grid
                this.container.appendChild(this.dragItem);
            }
            
            // Reset the item's position to static and clear inline styles
            this.dragItem.style.position = '';
            this.dragItem.style.top = '';
            this.dragItem.style.left = '';
            this.dragItem.style.width = '';
            this.dragItem.style.height = '';
            this.dragItem.style.zIndex = '';
            this.dragItem.style.transform = '';
            
            // Remove dragging class
            this.dragItem.classList.remove('dragging');
            
            // Refresh layout to ensure proper positioning
            this.refreshLayout();
            
            // Save the new layout
            this.saveLayoutConfig();
            
            // Add a brief delay to ensure the layout change is properly applied
            setTimeout(() => {
                // Check if the item is still in the grid - sometimes it might get removed from the DOM
                if (!this.container.contains(this.dragItem) && this.dragItem.parentNode !== this.container) {
                    console.log("Re-adding item to grid because it was removed");
                    this.container.appendChild(this.dragItem);
                }
                
                // Force another refresh to make sure everything is properly positioned
                this.refreshLayout();
            }, 50);
            
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
        
        // Highlight this card specifically during resize
        item.style.boxShadow = '0 0 0 2px #e63946';
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
                // Store original height if not already stored
                if (!this.resizeItem.dataset.originalHeight && contentElement.style.height) {
                    this.resizeItem.dataset.originalHeight = contentElement.style.height;
                }
                
                // Apply new height directly to this card only
                contentElement.style.height = `${newHeight - 80}px`; // Віднімаємо висоту заголовка і відступів
                
                // Force this card to have independent height by adding a specific class
                this.resizeItem.classList.add('custom-height');
                
                // Ensure grid container recalculates layout for optimal spacing
                this.refreshLayout();
                
                // Display a resize indicator
                if (!this.resizeItem.querySelector('.resize-indicator')) {
                    const indicator = document.createElement('div');
                    indicator.className = 'resize-indicator';
                    indicator.textContent = 'Змінюється тільки ця картка';
                    indicator.style.position = 'absolute';
                    indicator.style.top = '5px';
                    indicator.style.right = '5px';
                    indicator.style.background = 'rgba(230, 57, 70, 0.8)';
                    indicator.style.color = 'white';
                    indicator.style.padding = '3px 6px';
                    indicator.style.borderRadius = '4px';
                    indicator.style.fontSize = '10px';
                    indicator.style.zIndex = '100';
                    this.resizeItem.appendChild(indicator);
                }
            }
        }
        
        // Only update width classes if width significantly changed
        // This ensures height-only changes don't affect the grid column span
        if (Math.abs(deltaX) > 50) {
            this.updateItemWidth(this.resizeItem, newWidth);
            // Refresh layout to optimize card positions
            this.refreshLayout();
        }
    }
    
    updateItemWidth(item, width) {
        // Calculate columns based on width
        const cellWidth = 300; // Base cell width
        const cols = Math.max(1, Math.min(2, Math.round(width / cellWidth)));
        
        // Get current row span (height) class - we keep this as is
        let currentClass = '';
        if (item.classList.contains('size-1x1')) currentClass = 'size-1x1';
        else if (item.classList.contains('size-1x2')) currentClass = 'size-1x2';
        else if (item.classList.contains('size-2x1')) currentClass = 'size-2x1';
        else if (item.classList.contains('size-2x2')) currentClass = 'size-2x2';
        
        // Extract current height
        const currentHeight = parseInt(currentClass.split('x')[1]);
        
        // Remove existing width classes
        item.classList.remove('size-1x1', 'size-1x2', 'size-2x1', 'size-2x2');
        
        // Add appropriate size class with new width but keep same height
        item.classList.add(`size-${cols}x${currentHeight}`);
    }
    
    onResizeEnd(e) {
        if (!this.isResizing) return;
        
        // Reset resizing state
        this.isResizing = false;
        
        if (this.resizeItem) {
            // Remove resizing class
            this.resizeItem.classList.remove('resizing');
            
            // Remove resize highlight
            this.resizeItem.style.boxShadow = '';
            
            // Remove resize indicator if present
            const indicator = this.resizeItem.querySelector('.resize-indicator');
            if (indicator) {
                this.resizeItem.removeChild(indicator);
            }
            
            // Save the new layout
            this.saveLayoutConfig();
            
            // Refresh layout one more time to ensure optimal positioning
            this.refreshLayout();
            
            this.resizeItem = null;
        }
    }
    
    getElementBelow(x, y) {
        // Hide dragged element temporarily to find element below
        if (this.dragItem) {
            this.dragItem.style.display = 'none';
        }
        
        // Get multiple elements at position to improve accuracy
        // We'll check points in the center and corners of a small area
        const elements = [
            document.elementFromPoint(x, y),                  // Center
            document.elementFromPoint(x - 10, y - 10),        // Top-left
            document.elementFromPoint(x + 10, y - 10),        // Top-right
            document.elementFromPoint(x - 10, y + 10),        // Bottom-left
            document.elementFromPoint(x + 10, y + 10)         // Bottom-right
        ].filter(Boolean); // Remove null results
        
        // Restore dragged element
        if (this.dragItem) {
            this.dragItem.style.display = '';
        }
        
        // Find closest grid-item parent for each element point, prioritizing center point
        let gridItem = null;
        
        for (const elem of elements) {
            let parent = elem;
            while (parent && !parent.classList.contains('grid-item')) {
                parent = parent.parentElement;
            }
            
            if (parent && parent.classList.contains('grid-item')) {
                gridItem = parent;
                break;
            }
        }
        
        // If we found a grid item that isn't the one being dragged or its placeholder
        if (gridItem && 
            gridItem !== this.dragItem && 
            !gridItem.classList.contains('grid-item-placeholder')) {
        return gridItem;
        }
        
        return null;
    }
    
    swapItems(item1, item2) {
        // Don't swap with the same item
        if (item1 === item2) return;
        
        // Don't swap with placeholder
        if (item1.classList.contains('grid-item-placeholder') || 
            item2.classList.contains('grid-item-placeholder')) {
            return;
        }
        
        // Get the items' positions in the DOM
        const items = Array.from(this.container.children);
        const index1 = items.indexOf(item1);
        const index2 = items.indexOf(item2);
        
        // Only swap if both items are found in the grid
        if (index1 >= 0 && index2 >= 0) {
            // Find the placeholder
            const placeholder = this.container.querySelector('.grid-item-placeholder');
            
            if (placeholder) {
                // Mark the target position with our placeholder
            if (index1 < index2) {
                    this.container.insertBefore(placeholder, item2.nextSibling);
            } else {
                    this.container.insertBefore(placeholder, item2);
                }
                
                // Add a visual cue to the placeholder
                placeholder.style.transition = 'all 0.2s ease';
                placeholder.style.boxShadow = '0 0 10px rgba(65, 90, 119, 0.8)';
                setTimeout(() => {
                    placeholder.style.boxShadow = '';
                }, 200);
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
        
        // Copy height styles to ensure placeholder is the same size
        const contentElement = item.querySelector('.card-content');
        if (contentElement && contentElement.style.height) {
            const placeholderContent = document.createElement('div');
            placeholderContent.className = 'card-content';
            placeholderContent.style.height = contentElement.style.height;
            placeholder.appendChild(placeholderContent);
            
            if (item.classList.contains('custom-height')) {
                placeholder.classList.add('custom-height');
            }
        }
        
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
        
        // Remove all items from the grid
        sortedItems.forEach(item => {
            if (item.parentNode === this.container) {
                this.container.removeChild(item);
            }
        });
        
        // Apply positions and sizes to each item and add them back to the container in order
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
                    // Set the stored height directly to this specific card's content
                    contentElement.style.height = `${this.layoutConfig[id].height}px`;
                    // Mark this card as having custom height
                    item.classList.add('custom-height');
                }
            }
            
            // Clear any existing styles that might interfere with layout
            item.style.position = '';
            item.style.top = '';
            item.style.left = '';
            item.style.transform = '';
            
            // Add the item back to the container
            this.container.appendChild(item);
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
    
    // New method to refresh the grid layout for optimal space utilization
    refreshLayout() {
        // Toggle a class to force reflow of the grid
        this.container.classList.add('refresh-grid');
        setTimeout(() => {
            this.container.classList.remove('refresh-grid');
            
            // Update items array in case DOM has changed
            this.items = Array.from(this.container.querySelectorAll('.grid-item'));
        }, 10);
    }
    
    // Force re-initialization of all grid items
    reinitializeGrid() {
        // Get all current items
        this.items = Array.from(this.container.querySelectorAll('.grid-item'));
        
        // Re-apply all styles and positions
        this.items.forEach(item => {
            // Make sure the item is in the grid
            if (item.parentNode !== this.container) {
                this.container.appendChild(item);
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
        buttonContainer.style.position = 'fixed';
        buttonContainer.style.bottom = '20px';
        buttonContainer.style.right = '20px';
        buttonContainer.style.zIndex = '100';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
        buttonContainer.style.padding = '8px 10px';
        buttonContainer.style.borderRadius = '8px';
        buttonContainer.style.background = 'rgba(27, 38, 59, 0.8)';
        buttonContainer.style.border = '2px solid #ffffff';
        
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