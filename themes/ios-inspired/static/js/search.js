// --- Fuse.js Search Logic ---
(function() {
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    const mainContent = document.querySelector('.main-container');
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
                keys: ['title', 'content', 'tags'],
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
            mainContent.style.display = 'none'; // Hide main content
            searchResults.style.display = 'block'; // Show search results
        } else {
            searchResults.innerHTML = '';
            mainContent.style.display = 'block'; // Show main content
            searchResults.style.display = 'none'; // Hide search results
        }
    }

    // 3. Render the search results to the page
    function displayResults(results) {
        searchResults.innerHTML = ''; // Clear previous results

        if (results.length > 0) {
            const resultList = document.createElement('ul');
            resultList.className = 'search-results-list';

            results.forEach(({ item }) => {
                const li = document.createElement('li');
                li.className = 'search-result-item';
                
                const a = document.createElement('a');
                a.href = item.permalink;
                a.textContent = item.title;
                
                li.appendChild(a);
                resultList.appendChild(li);
            });
            searchResults.appendChild(resultList);
        } else {
            const noResults = document.createElement('div');
            noResults.className = 'search-no-results';
            noResults.textContent = 'No results found.';
            searchResults.appendChild(noResults);
        }
    }

    // Initialize search on page load
    initSearch();
    
    // Add event listener to the search input
    if (searchInput) {
        searchInput.addEventListener('input', performSearch);
    }
})();
