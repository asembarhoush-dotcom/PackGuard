
const RecentActivityService = {
  /**
   * Adds an item to the recent activity list in localStorage.
   * @param {object} config - Configuration object
   * @param {string} config.storageKey - Key to store data in localStorage
   * @param {object} item - Item to add
   * @param {string} item.scopeKey
   * @param {string} item.kind
   * @param {string} item.entityId
   * @param {string} item.route
   * @param {string} item.title
   * @param {string} [item.subtitle]
   */
  addItem: (config, item) => {
    const { storageKey } = config;
    if (!storageKey) {
        console.warn('RecentActivityService: storageKey is required');
        return;
    }

    try {
      const storedData = localStorage.getItem(storageKey);
      let activities = [];

      if (storedData) {
        try {
            activities = JSON.parse(storedData);
        } catch (e) {
            activities = [];
        }
      }

      const newItem = {
        ...item,
        updatedAt: Date.now(),
      };

      // Deduplicate: Remove existing item with same scopeKey, kind, entityId
      activities = activities.filter(
        (existing) =>
          !(
            existing.scopeKey === newItem.scopeKey &&
            existing.kind === newItem.kind &&
            existing.entityId === newItem.entityId
          )
      );

      // Add new item to top
      activities.unshift(newItem);

      // Limit to 20
      if (activities.length > 20) {
        activities = activities.slice(0, 20);
      }

      localStorage.setItem(storageKey, JSON.stringify(activities));
      
      // Dispatch custom event to notify listeners (like Sidebar)
      const event = new CustomEvent('recentActivityUpdated', { detail: { storageKey } });
      window.dispatchEvent(event);

    } catch (error) {
      console.error('RecentActivityService: Error writing to localStorage', error);
    }
  },

  /**
   * Clears the recent activity list.
   * @param {string} storageKey 
   */
  clear: (storageKey) => {
      try {
          localStorage.removeItem(storageKey);
      } catch (error) {
          console.error('RecentActivityService: Error clearing localStorage', error);
      }
  }
};

export default RecentActivityService;
