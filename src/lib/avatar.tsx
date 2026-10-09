// Avatar rendering helper. A character's `avatar` is usually a single emoji, but
// when a creator uploads an image it is stored as an `http(s)` URL or a base64
// `data:` URL. Those must be drawn as an <img>; rendering them as a text node
// dumps the whole (often thousands-of-chars) string across the page. Every avatar
// surface should go through here so an uploaded image never leaks as giant text.

export function isImageAvatar(avatar: string | null | undefined): boolean {
  if (!avatar) return false
  return avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('data:')
}

/**
 * Renders the inside of an avatar box: an <img> for uploaded images, otherwise
 * the emoji/text. Drop this inside an existing avatar container (which should set
 * `overflow: 'hidden'` so the image is clipped to the box's rounded corners).
 */
export function AvatarFill({
  avatar,
  fallback = '✦',
  alt = '',
}: {
  avatar: string | null | undefined
  fallback?: string
  alt?: string
}) {
  if (isImageAvatar(avatar)) {
    return (
      <img
        src={avatar as string}
        alt={alt}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    )
  }
  return <>{avatar || fallback}</>
}
