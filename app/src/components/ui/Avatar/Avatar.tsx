import './Avatar.css';

type AvatarProps = {
  name: string;
  imageUrl?: string;
  onClick?: () => void;
};

function Avatar({ name, imageUrl, onClick }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <button
      className="avatar"
      onClick={onClick}
      aria-label="User profile"
    >
      {imageUrl ? (
        <img src={imageUrl} alt={name} />
      ) : (
        <span>{initials}</span>
      )}
    </button>
  );
}

export default Avatar;