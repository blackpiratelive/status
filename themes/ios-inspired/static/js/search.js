// --- Fuse.js Search Logic ---
(function() {
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    const mainContentArea = document.getElementById('main-content-area');
    const clearSearchBtn = document.getElementById('clear-search-btn');
    let fuse;
    let posts = [];

    // 1. Fetch and initialize the search index
    async function initSearch() {
        try {
            const response = await fetch('/index.json');
            if (!response.ok) {
                throw new Error('Failed to load search index');
            }
            posts = await response.json();
            
            const options = {
                keys: ['title', 'plainContent', 'tags'],
                includeMatches: true,
                minMatchCharLength: 2,
                threshold: 0.4,
            };
            fuse = new Fuse(posts, options);
        } catch (error) {
            console.error(error);
        }
    }

    // 2. Perform search and display results
    function performSearch() {
        const query = searchInput.value;

        if (query.length > 1) {
            const results = fuse.search(query);
            displayResults(results);
            if(mainContentArea) mainContentArea.style.display = 'none';
            if(searchResults) searchResults.style.display = 'block';
            if(clearSearchBtn) clearSearchBtn.style.display = 'block';
        } else {
            if(searchResults) searchResults.innerHTML = '';
            if(mainContentArea) mainContentArea.style.display = 'block';
            if(searchResults) searchResults.style.display = 'none';
            if(clearSearchBtn) clearSearchBtn.style.display = 'none';
        }
    }

    // 3. Render the search results to the page
    function displayResults(results) {
        if(!searchResults) return;
        searchResults.innerHTML = ''; // Clear previous results

        if (results.length > 0) {
            const resultsContainer = document.createElement('div');
            resultsContainer.className = 'log-entries';

            results.forEach(({ item }) => {
                const card = document.createElement('div');
                card.className = 'card log-entry';
                card.innerHTML = buildCardHTML(item);
                resultsContainer.appendChild(card);
            });
            searchResults.appendChild(resultsContainer);
        } else {
            const noResults = document.createElement('div');
            noResults.className = 'search-no-results';
            noResults.textContent = 'No results found.';
            searchResults.appendChild(noResults);
        }
    }

    // 4. Helper to build the card HTML from a result item
    function buildCardHTML(item) {
        let tagsHTML = '';
        if (item.tags && item.tags.length > 0) {
            tagsHTML = `<div>${item.tags.map(tag => `
                <a href="/tags/${tag.toLowerCase().replace(/ /g, '-')}" class="log-tag">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
                    <span>#${tag}</span>
                </a>
            `).join('')}</div>`;
        }

        let lastModHTML = '';
        if (item.isModified) {
            lastModHTML = `
                <div class="log-entry-lastmod">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    <time>${item.isModifiedOnSameDay ? item.lastmodTime : item.lastmod}</time>
                </div>
            `;
        }

        return `
            <div class="post-number">#${item.postNumber}</div>
            <div class="meta-wrapper">
                <div class="log-entry-meta">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    <time>${item.date}</time>
                </div>
                ${lastModHTML}
            </div>
            <div class="log-entry-content ${item.tags ? 'with-tag' : ''}">
                ${item.content}
            </div>
            ${tagsHTML}
        `;
    }

    // 5. Clear search functionality
    function clearSearch() {
        searchInput.value = '';
        performSearch();
    }

    // Initialize search on page load
    initSearch();
    
    // Add event listeners
    if (searchInput) {
        searchInput.addEventListener('input', performSearch);
    }
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', clearSearch);
    }
})();
