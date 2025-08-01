document.addEventListener('DOMContentLoaded', () => {

    // Find all elements we want to animate
    const animatedElements = document.querySelectorAll('.polaroid-card');

    if (animatedElements.length > 0) {
        // Set up the Intersection Observer
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                // If the element is in the viewport, add the 'animate-in' class
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-in');
                    // Optional: Stop observing the element once it has animated in
                    observer.unobserve(entry.target);
                }
            });
        }, {
            // Options for the observer
            threshold: 0.1 // Trigger when 10% of the element is visible
        });

        // Start observing each of the elements
        animatedElements.forEach(element => {
            observer.observe(element);
        });
    }

});
