const getStoragePath = (publicUrl) => {
  try {
    const segments = new URL(publicUrl).pathname.split("/");
    const folderIndex = segments.indexOf("Posts");
    return folderIndex < 0
      ? null
      : segments.slice(folderIndex).map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
};

export const getPostStoragePaths = (post) => {
  const mediaUrls = Array.isArray(post?.media)
    ? post.media.map((media) => media.url)
    : [];
  const urls = [...mediaUrls, post?.image].filter(Boolean);

  return [...new Set(urls.map(getStoragePath).filter(Boolean))];
};
