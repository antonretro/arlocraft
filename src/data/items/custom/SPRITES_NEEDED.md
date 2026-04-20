# Custom Item Sprites Needed

These items are ArloCraft originals with no Minecraft equivalent.
Each needs a 16×16 or 32×32 PNG sprite placed in its folder as the filename listed below.

| Item            | File                | Type   | Notes                         |
| --------------- | ------------------- | ------ | ----------------------------- |
| byte_axe        | byte_axe.png        | axe    | High-tech digital axe         |
| echo_dagger     | echo_dagger.png     | dagger | Short blade with trail effect |
| arc_spear       | arc_spear.png       | spear  | Electric long-reach spear     |
| plasma_hammer   | plasma_hammer.png   | hammer | Massive plasma warhammer      |
| pulse_pistol    | pulse_pistol.png    | gun    | Compact energy pistol         |
| rail_rifle      | rail_rifle.png      | gun    | Long-range railgun            |
| scatter_blaster | scatter_blaster.png | gun    | Short-range energy shotgun    |

## How sprites get picked up

Place the PNG in the item's folder. Then add an entry to the `toolMap` in
`src/ui/HUD.js` → `getIconPath()` pointing the item ID to the texture key,
**or** register it via the content pack system in `src/content/items/packs/`.
