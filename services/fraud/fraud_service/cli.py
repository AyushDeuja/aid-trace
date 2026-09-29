import argparse
import json

from .repository import FraudRepository

parser = argparse.ArgumentParser(description="Run one finalized, advisory AidTrace fraud scoring pass.")
parser.add_argument("--cluster", choices=["devnet", "localnet"], default="devnet")
args = parser.parse_args()
print(json.dumps(FraudRepository().run(args.cluster), default=str, indent=2))
