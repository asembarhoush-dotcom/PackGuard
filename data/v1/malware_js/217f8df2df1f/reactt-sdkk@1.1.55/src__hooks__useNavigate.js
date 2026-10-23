
const useNavigate = () => {
  const customNavigate = (url, options = {}) => {
    const { newTab = false } = options;

    if (newTab) {
      window.open(url, '_blank');
    } else {
      window.location.href = url;
    }
  };

  return customNavigate;
};

export default useNavigate;
