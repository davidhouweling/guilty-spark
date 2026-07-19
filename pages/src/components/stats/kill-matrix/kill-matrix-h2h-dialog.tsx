import React from "react";
import { Dialog } from "../../dialog/dialog";
import { TeamIcon } from "../../icons/team-icon";
import type { H2HDialogData } from "../../../controllers/stats/kill-matrix/types";
import styles from "./kill-matrix-h2h-dialog.module.css";

interface KillMatrixH2HDialogProps {
  readonly data: H2HDialogData | null;
  readonly onClose: () => void;
}

function PlayerHeader({
  gamertag,
  teamId,
}: {
  readonly gamertag: string;
  readonly teamId: number | null;
}): React.ReactElement {
  return (
    <span className={styles.playerHeader}>
      {teamId != null && <TeamIcon teamId={teamId} size="small" />}
      {gamertag}
    </span>
  );
}

export function KillMatrixH2HDialog({ data, onClose }: KillMatrixH2HDialogProps): React.ReactElement {
  return (
    <Dialog open={data != null} title="Head to head" onClose={onClose} panelClassName={styles.dialogPanel}>
      {data != null && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.playerCol}>
                <PlayerHeader gamertag={data.playerA.gamertag} teamId={data.playerA.teamId} />
              </th>
              <th className={styles.statCol} />
              <th className={styles.playerCol}>
                <PlayerHeader gamertag={data.playerB.gamertag} teamId={data.playerB.teamId} />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={styles.valueCell}>{data.aKillsOnB}</td>
              <td className={styles.statCell}>Kills</td>
              <td className={styles.valueCell}>{data.bKillsOnA}</td>
            </tr>
            <tr>
              <td className={styles.valueCell}>{data.aPerfsOnB}</td>
              <td className={styles.statCell}>Perfects</td>
              <td className={styles.valueCell}>{data.bPerfsOnA}</td>
            </tr>
            {data.weaponRows.map((row) => (
              <tr key={row.weaponId}>
                <td className={styles.valueCell}>{row.aCount}</td>
                <td className={styles.statCell}>{row.name}</td>
                <td className={styles.valueCell}>{row.bCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Dialog>
  );
}
